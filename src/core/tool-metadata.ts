/**
 * Pull tool metadata (name, description, inputSchema) out of geo-agent's
 * createMapTools(mapManager, catalog, mcpClient) without executing the
 * tools. Needed so the human-facing forms in the LayerDetails pane can
 * show the same guidance the LLM sees, and stay in sync on `yarn upgrade`.
 *
 * We pass a minimal shim for mapManager — only getLayerIds() and
 * getVectorLayerIds() are consumed by the description templates. Catalog
 * and mcpClient stubs are fine because their real methods are only
 * called inside execute functions, which we do not invoke.
 *
 * When the shared @boettiger-lab/geo-agent-core package lands
 * (geojupyter/jupyter-geoagent#2), swap this import for the new path.
 */

import { createMapTools } from 'geo-agent/app/map-tools.js';
import type { MapViewController } from '../components/MapView';

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: any;
}

export function getToolMetadata(
  controller: MapViewController,
): Record<string, ToolMetadata> {
  const mapManagerShim = {
    getLayerIds: () => [...controller.layers.keys()],
    getVectorLayerIds: () =>
      [...controller.layers.entries()]
        .filter(([, s]) => s.type === 'vector')
        .map(([id]) => id),
    getLayerSummaries: () =>
      [...controller.layers.entries()].map(([id, state]) => ({
        id,
        displayName: state.displayName,
        type: state.type,
      })),
  };
  const catalogStub = { getAll: () => [], get: () => null, getIds: () => [] };
  // Pass a truthy stub so filter_by_query metadata is included.
  const mcpClientStub = {};

  const tools = createMapTools(
    mapManagerShim as any,
    catalogStub as any,
    mcpClientStub as any,
  );

  const out: Record<string, ToolMetadata> = {};
  for (const t of tools) {
    out[t.name] = {
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    };
  }
  return out;
}
