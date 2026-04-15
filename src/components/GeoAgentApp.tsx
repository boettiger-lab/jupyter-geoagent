/**
 * GeoAgentApp — the root React component for the GeoAgent panel.
 *
 * Composes the MapView, CatalogBrowser, LayerPanel, QueryPanel, and ExportPanel
 * into a three-column layout.
 */

import * as React from 'react';
import { ServerConnection } from '@jupyterlab/services';
import { MapView, MapViewController } from './MapView';
import { CatalogBrowser } from './CatalogBrowser';
import { LayerPanel } from './LayerPanel';
import { QueryPanel } from './QueryPanel';
import { ExportPanel } from './ExportPanel';
import { ToolCallRecorder } from '../core/tools';
import { MCPClientWrapper } from '../core/mcp';

export interface GeoAgentAppProps {
  serverSettings: ServerConnection.ISettings;
  defaultCatalogUrl: string;
  titilerUrl: string;
  mcpServerUrl?: string;
  mcpHeaders?: Record<string, string>;
  useProxy?: boolean;
}

type RightTab = 'layers' | 'query' | 'export';

export const GeoAgentApp: React.FC<GeoAgentAppProps> = ({
  serverSettings,
  defaultCatalogUrl,
  titilerUrl,
  mcpServerUrl,
  mcpHeaders,
  useProxy,
}) => {
  const [mapController, setMapController] = React.useState<MapViewController | null>(null);
  const [mcpClient, setMcpClient] = React.useState<MCPClientWrapper | null>(null);
  const [activeTab, setActiveTab] = React.useState<RightTab>('layers');
  const [layerRefreshKey, setLayerRefreshKey] = React.useState(0);

  const recorderRef = React.useRef(new ToolCallRecorder(defaultCatalogUrl));

  // Connect MCP client on mount
  React.useEffect(() => {
    if (!mcpServerUrl) return;

    const client = new MCPClientWrapper(mcpServerUrl, {
      headers: mcpHeaders,
      useProxy: useProxy ?? false,
      jupyterSettings: serverSettings,
    });

    client.connect()
      .then(() => setMcpClient(client))
      .catch(e => console.warn('[GeoAgent] MCP connection failed:', e.message));
  }, [mcpServerUrl, mcpHeaders, useProxy, serverSettings]);

  const handleDatasetAdded = React.useCallback(() => {
    setLayerRefreshKey(k => k + 1);
  }, []);

  const handleMapReady = React.useCallback((ctrl: MapViewController) => {
    setMapController(ctrl);

    // Handle resize when JupyterLab panels change size
    const observer = new ResizeObserver(() => ctrl.resize());
    const el = ctrl.map.getContainer();
    if (el) observer.observe(el);
  }, []);

  return (
    <div className="jp-GeoAgent-app">
      {/* Left sidebar: Catalog Browser */}
      <div className="jp-GeoAgent-sidebar jp-GeoAgent-sidebar-left">
        <CatalogBrowser
          defaultCatalogUrl={defaultCatalogUrl}
          titilerUrl={titilerUrl}
          mapController={mapController}
          recorder={recorderRef.current}
          onDatasetAdded={handleDatasetAdded}
        />
      </div>

      {/* Center: Map */}
      <div className="jp-GeoAgent-main">
        <MapView
          titilerUrl={titilerUrl}
          onMapReady={handleMapReady}
        />
      </div>

      {/* Right sidebar: Layers / Query / Export tabs */}
      <div className="jp-GeoAgent-sidebar jp-GeoAgent-sidebar-right">
        <div className="jp-GeoAgent-tabs">
          <button
            className={`jp-GeoAgent-tab ${activeTab === 'layers' ? 'jp-GeoAgent-tab-active' : ''}`}
            onClick={() => setActiveTab('layers')}
          >
            Layers
          </button>
          <button
            className={`jp-GeoAgent-tab ${activeTab === 'query' ? 'jp-GeoAgent-tab-active' : ''}`}
            onClick={() => setActiveTab('query')}
          >
            Query
          </button>
          <button
            className={`jp-GeoAgent-tab ${activeTab === 'export' ? 'jp-GeoAgent-tab-active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            Export
          </button>
        </div>

        <div className="jp-GeoAgent-tab-content">
          {activeTab === 'layers' && (
            <LayerPanel
              mapController={mapController}
              recorder={recorderRef.current}
              refreshKey={layerRefreshKey}
            />
          )}
          {activeTab === 'query' && (
            <QueryPanel
              mcpClient={mcpClient}
              recorder={recorderRef.current}
              serverSettings={serverSettings}
              defaultMcpUrl={mcpServerUrl}
              useProxy={useProxy}
            />
          )}
          {activeTab === 'export' && (
            <ExportPanel
              mapController={mapController}
              recorder={recorderRef.current}
              catalogUrl={defaultCatalogUrl}
              titilerUrl={titilerUrl}
            />
          )}
        </div>
      </div>
    </div>
  );
};
