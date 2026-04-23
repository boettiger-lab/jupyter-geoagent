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

/** Skip tools that depend on machinery jupyter-geoagent doesn't provide yet. */
const SKIP_TOOLS = new Set([
  'list_datasets',          // needs DatasetCatalog; jupyter-geoagent uses MCP-backed catalog
  'get_dataset_details',    // same
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
  const stubManager = { getLayerIds: () => [], getVectorLayerIds: () => [] };
  const stubCatalog = { getAll: () => [], get: () => null, getIds: () => [] };
  const stubMcp = {};
  const toolMetadata = createMapTools(stubManager as any, stubCatalog as any, stubMcp as any);

  for (const meta of toolMetadata) {
    if (SKIP_TOOLS.has(meta.name)) continue;

    const commandId = `geoagent:${meta.name}`;

    app.commands.addCommand(commandId, {
      label: `GeoAgent: ${meta.name}`,
      caption: firstLine(meta.description),
      describedBy: { args: meta.inputSchema },
      execute: async (args) => {
        const panel = getActivePanel();
        if (!panel) return NO_PANEL_ERROR;
        const argsObj = (args ?? {}) as Record<string, any>;

        // Route filter_by_query through our local implementation, which wraps
        // array_agg in to_json() so DuckDB's MCP output is JSON-parseable.
        // Upstream geo-agent has the same bug (uses bare array_agg); remove
        // this branch once the upstream fix ships.
        if (meta.name === 'filter_by_query') {
          if (!panel.mcpClient) {
            return recordAndReturn(panel, meta.name, argsObj,
              { success: false, error: 'filter_by_query requires an MCP connection. Connect to the MCP server in the Query tab first.' });
          }
          try {
            const result = await panel.controller.filterByQuery(
              argsObj.layer_id,
              argsObj.sql,
              argsObj.id_property,
              panel.mcpClient,
            );
            panel.refresh();
            return recordAndReturn(panel, meta.name, argsObj, result);
          } catch (err: any) {
            return recordAndReturn(panel, meta.name, argsObj,
              { success: false, error: err?.message ?? String(err) });
          }
        }

        const adapter = new MapManagerAdapter(panel.controller, { onChange: panel.refresh });
        // Rebuild the tool with the real adapter + mcpClient so closures bind
        // to the current panel's state.
        const tools = createMapTools(adapter as any, stubCatalog as any, panel.mcpClient ?? undefined);
        const tool = tools.find(t => t.name === meta.name);
        if (!tool) {
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
