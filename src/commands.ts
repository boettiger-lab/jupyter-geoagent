/**
 * Register one JupyterLab command per geo-agent map tool.
 *
 * Wiring:
 *   app.commands.addCommand('geoagent:<tool_name>', { execute, describedBy })
 *     → jupyter-ai persona calls execute_command (via jupyter_server_mcp MCP tool)
 *     → jupyterlab_commands_toolkit emits a jupyterlab-command/v1 event
 *     → the frontend event listener calls app.commands.execute('geoagent:<tool_name>', args)
 *     → this handler looks up the active panel and dispatches through createMapTools()
 *
 * Call this once at plugin activation. Commands stay registered for the
 * lifetime of the JupyterLab session; they error clearly if no panel is open.
 */

import { JupyterFrontEnd } from '@jupyterlab/application';
import { createMapTools } from 'geo-agent/app/map-tools.js';
import { MapManagerAdapter } from './core/map-manager-adapter';
import { getActivePanel } from './core/active-panel';
import { assetToMapLayerConfig, extractColumns, MCPCollection } from './core/mcp-catalog';

/** Skip tools that depend on machinery jupyter-geoagent doesn't provide yet. */
const SKIP_TOOLS = new Set([
  'list_datasets',          // needs DatasetCatalog; jupyter-geoagent uses MCP-backed catalog
  'get_schema',             // same — delegates to catalog.get(dataset_id)
  'set_projection',         // MapViewController doesn't implement globe/mercator toggle
]);

const NO_PANEL_ERROR = JSON.stringify({
  success: false,
  error: 'No GeoAgent Map panel is open. Ask the user to open one from the JupyterLab launcher (File → New → GeoAgent Map).',
});

export function registerGeoAgentCommands(app: JupyterFrontEnd): void {
  // Build the tool list once using stubs — we only use each entry's name,
  // description, and inputSchema here. Real mapManager/catalog/mcpClient are
  // resolved inside each execute handler from getActivePanel().
  const stubManager = {
    getLayerIds: () => [],
    getVectorLayerIds: () => [],
    getLayerSummaries: () => [],
  };
  const stubCatalog = { getAll: () => [], get: () => null, getIds: () => [] };
  const stubMcp = {};
  const toolMetadata = createMapTools(stubManager as any, stubCatalog as any, stubMcp as any);

  for (const meta of toolMetadata) {
    if (SKIP_TOOLS.has(meta.name)) continue;

    const commandId = `geoagent:${meta.name}`;

    app.commands.addCommand(commandId, {
      label: `GeoAgent: ${meta.name}`,
      caption: firstLine(meta.description),
      // `usage` is what jupyterlab_commands_toolkit surfaces as `description`
      // in list_all_commands output, so the LLM sees the full tool description
      // (including nudges like "IMPORTANT: check featuresInView" and available
      // layer lists), not just the one-line caption.
      usage: meta.description,
      describedBy: { args: meta.inputSchema },
      execute: async (args) => {
        const panel = getActivePanel();
        if (!panel) return NO_PANEL_ERROR;
        const argsObj = (args ?? {}) as Record<string, any>;

        const adapter = new MapManagerAdapter(panel.controller, { onChange: panel.refresh });
        // Rebuild the tool with the real adapter + mcpClient so closures bind
        // to the current panel's state.
        const tools = createMapTools(adapter as any, stubCatalog as any, panel.mcpClient ?? undefined);
        const tool = tools.find(t => t.name === meta.name);
        if (!tool) {
          // map-tools.js only includes filter_by_query when mcpClient is truthy,
          // so a missing tool here usually means the panel has no MCP connection.
          if (meta.name === 'filter_by_query' && !panel.mcpClient) {
            return recordAndReturn(panel, meta.name, argsObj,
              { success: false, error: 'filter_by_query requires an MCP connection. Connect to the MCP server in the Query tab first.' });
          }
          return recordAndReturn(panel, meta.name, argsObj,
            { success: false, error: `Tool '${meta.name}' not found in createMapTools output.` });
        }

        try {
          const result = await Promise.resolve(tool.execute(argsObj));
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          panel.recorder.record(meta.name, argsObj, resultStr);
          return resultStr;
        } catch (err: any) {
          return recordAndReturn(panel, meta.name, argsObj,
            { success: false, error: err?.message ?? String(err) });
        }
      },
    });
  }

  registerAddLayerCommand(app);
}

/**
 * `geoagent:add_layer` — jupyter-geoagent-specific command (not part of the
 * geo-agent tool set). Fetches a STAC asset via MCP `get_collection` and adds
 * it to the map as a live PMTiles/COG layer, equivalent to clicking
 * "Add to Map" in the catalog browser.
 *
 * Needed because geo-agent web apps have their layers pre-configured at
 * deploy time, but in jupyter-geoagent the user expects to compose the map
 * interactively — so the LLM needs an addable-layer path too.
 */
function registerAddLayerCommand(app: JupyterFrontEnd): void {
  app.commands.addCommand('geoagent:add_layer', {
    label: 'GeoAgent: add_layer',
    caption: 'Add a STAC asset (PMTiles or COG) to the map as a live interactive layer.',
    usage: `Add a STAC asset from the configured catalog as a live interactive map layer (PMTiles vector or COG raster). This is the correct way to bring a dataset onto the map when the user asks you to "add X" or "show X" — do NOT write config files, export GeoJSON, or otherwise materialize the data client-side.

Workflow:
1. Use browse_stac_catalog (MCP) to find a collection_id.
2. Use get_collection (MCP) to see which assets are available — PMTiles assets typically have href ending in .pmtiles, COG raster assets have href ending in .tif / .tiff.
3. Call this command with the collection_id and asset_id. The command returns the layer_id you can use in subsequent set_filter / set_style / filter_by_query / show_layer / hide_layer calls.

After adding, the map flies to the collection's extent and the layer is visible.

Parameters:
- collection_id: the STAC collection ID (e.g., 'fire-perimeters')
- asset_id: the visual asset key inside the collection (e.g., 'firep-pmtiles')`,
    describedBy: {
      args: {
        type: 'object',
        properties: {
          collection_id: { type: 'string', description: 'STAC collection ID' },
          asset_id: { type: 'string', description: 'Visual asset key (PMTiles vector or COG raster)' },
        },
        required: ['collection_id', 'asset_id'],
      },
    },
    execute: async (args) => {
      const panel = getActivePanel();
      if (!panel) return NO_PANEL_ERROR;
      const argsObj = (args ?? {}) as Record<string, any>;

      if (!panel.mcpClient) {
        return recordAndReturn(panel, 'add_layer', argsObj,
          { success: false, error: 'add_layer requires an MCP connection. Connect to the MCP server in the Query tab first.' });
      }

      const collectionId = argsObj.collection_id;
      const assetId = argsObj.asset_id;
      if (!collectionId || !assetId) {
        return recordAndReturn(panel, 'add_layer', argsObj,
          { success: false, error: 'Both collection_id and asset_id are required.' });
      }

      let parsed: MCPCollection;
      try {
        const raw = await panel.mcpClient.callTool('get_collection', { collection_id: collectionId });
        parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw as MCPCollection);
      } catch (err: any) {
        return recordAndReturn(panel, 'add_layer', argsObj,
          { success: false, error: `Failed to fetch collection '${collectionId}': ${err?.message ?? String(err)}` });
      }
      if ((parsed as any).error) {
        return recordAndReturn(panel, 'add_layer', argsObj,
          { success: false, error: `Collection '${collectionId}' not found: ${(parsed as any).error}` });
      }

      const asset = parsed.assets?.[assetId];
      if (!asset) {
        const available = Object.keys(parsed.assets || {}).join(', ') || '(none)';
        return recordAndReturn(panel, 'add_layer', argsObj,
          { success: false, error: `Asset '${assetId}' not found in collection '${collectionId}'. Available assets: ${available}` });
      }

      const config = assetToMapLayerConfig(collectionId, assetId, asset, panel.s3Endpoint, panel.titilerUrl);
      if (!config) {
        return recordAndReturn(panel, 'add_layer', argsObj,
          { success: false, error: `Asset '${assetId}' is not a visual type. add_layer only supports PMTiles (vector) or COG (raster) assets.` });
      }

      const columns = extractColumns(parsed);
      const layerId = panel.controller.addLayer(collectionId, config, columns);
      panel.controller.showLayer(layerId);

      // Fly to the collection's extent so the user immediately sees it.
      const bbox = parsed.extent?.spatial?.bbox?.[0];
      if (bbox) {
        const [west, south, east, north] = bbox;
        panel.controller.flyTo([(west + east) / 2, (south + north) / 2]);
      }

      panel.refresh();
      return recordAndReturn(panel, 'add_layer', argsObj,
        { success: true, layer_id: layerId, ...(bbox ? { bbox } : {}) });
    },
  });
}

function firstLine(s: string): string {
  const idx = s.indexOf('\n');
  return idx === -1 ? s : s.slice(0, idx);
}

function recordAndReturn(
  panel: NonNullable<ReturnType<typeof getActivePanel>>,
  toolName: string,
  args: Record<string, any>,
  result: unknown,
): string {
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
  panel.recorder.record(toolName, args, resultStr);
  return resultStr;
}
