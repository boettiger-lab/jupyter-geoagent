/**
 * CatalogBrowser — sidebar panel for browsing STAC catalogs.
 *
 * Supports nested catalogs: group collections (those with child links)
 * show an expand/collapse toggle; leaf collections show an "Add" button.
 */

import * as React from 'react';
import { STACBrowser, CatalogNode } from '../core/stac';
import { MapViewController } from './MapView';
import { ToolCallRecorder } from '../core/tools';

export interface CatalogBrowserProps {
  defaultCatalogUrl: string;
  titilerUrl: string;
  mapController: MapViewController | null;
  recorder: ToolCallRecorder;
  /**
   * Called after a dataset's layers have been added to the map.
   * `firstLayerId` is the id of the first map layer created (if any),
   * so the host can auto-select it in the LayerPanel.
   */
  onDatasetAdded?: (datasetId: string, firstLayerId?: string) => void;
}

export const CatalogBrowser: React.FC<CatalogBrowserProps> = ({
  defaultCatalogUrl,
  titilerUrl,
  mapController,
  recorder,
  onDatasetAdded,
}) => {
  const [catalogUrl, setCatalogUrl] = React.useState(defaultCatalogUrl);
  const [nodes, setNodes] = React.useState<CatalogNode[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [addedIds, setAddedIds] = React.useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [expandingIds, setExpandingIds] = React.useState<Set<string>>(new Set());
  const [childrenMap, setChildrenMap] = React.useState<Map<string, CatalogNode[]>>(new Map());
  const [filter, setFilter] = React.useState('');
  const browserRef = React.useRef<STACBrowser | null>(null);

  const loadCatalog = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setNodes([]);
    setAddedIds(new Set());
    setExpandedIds(new Set());
    setChildrenMap(new Map());

    try {
      const browser = new STACBrowser(catalogUrl, titilerUrl);
      browserRef.current = browser;
      const cols = await browser.listCollections();
      setNodes(cols.sort((a, b) => a.title.localeCompare(b.title)));
    } catch (e: any) {
      setError(e.message || 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [catalogUrl, titilerUrl]);

  React.useEffect(() => {
    loadCatalog();
  }, []);

  const toggleExpand = React.useCallback(async (node: CatalogNode) => {
    if (expandedIds.has(node.id)) {
      setExpandedIds(prev => { const s = new Set(prev); s.delete(node.id); return s; });
      return;
    }

    if (!browserRef.current) return;

    // Load children if not yet fetched
    if (!childrenMap.has(node.id)) {
      setExpandingIds(prev => new Set(prev).add(node.id));
      try {
        const children = await browserRef.current.expandNode(node);
        setChildrenMap(prev => new Map(prev).set(node.id, children.sort((a, b) => a.title.localeCompare(b.title))));
      } catch (e: any) {
        console.error(`Failed to expand ${node.id}:`, e);
      } finally {
        setExpandingIds(prev => { const s = new Set(prev); s.delete(node.id); return s; });
      }
    }

    setExpandedIds(prev => new Set(prev).add(node.id));
  }, [expandedIds, childrenMap]);

  const addCollection = React.useCallback(async (collectionId: string) => {
    if (!mapController || !browserRef.current) return;

    try {
      const dataset = await browserRef.current.getDataset(collectionId);
      if (!dataset) return;

      let firstLayerId: string | undefined;
      for (const layer of dataset.mapLayers) {
        const layerId = mapController.addLayer(dataset.id, layer, dataset.columns);
        mapController.showLayer(layerId);
        recorder.record('show_layer', { layer_id: layerId });
        if (!firstLayerId) firstLayerId = layerId;
      }

      if (dataset.extent?.spatial?.bbox?.[0]) {
        const [west, south, east, north] = dataset.extent.spatial.bbox[0];
        const center: [number, number] = [(west + east) / 2, (south + north) / 2];
        mapController.flyTo(center);
        recorder.record('fly_to', { center, zoom: mapController.map.getZoom() });
      }

      setAddedIds(prev => new Set([...prev, collectionId]));
      if (onDatasetAdded) onDatasetAdded(collectionId, firstLayerId);
    } catch (e: any) {
      console.error(`Failed to add collection ${collectionId}:`, e);
    }
  }, [mapController, recorder, onDatasetAdded]);

  /** Recursively check if a node or any descendant matches the filter. */
  const matchesFilter = React.useCallback((node: CatalogNode, q: string): boolean => {
    if (node.title.toLowerCase().includes(q) ||
        node.description.toLowerCase().includes(q) ||
        node.id.toLowerCase().includes(q)) {
      return true;
    }
    const children = childrenMap.get(node.id);
    if (children) {
      return children.some(c => matchesFilter(c, q));
    }
    return false;
  }, [childrenMap]);

  const filtered = React.useMemo(() => {
    if (!filter) return nodes;
    const q = filter.toLowerCase();
    return nodes.filter(n => matchesFilter(n, q));
  }, [nodes, filter, matchesFilter]);

  const renderNode = (node: CatalogNode, depth: number): React.ReactNode => {
    const isExpanded = expandedIds.has(node.id);
    const isExpanding = expandingIds.has(node.id);
    const children = childrenMap.get(node.id);

    // When filtering and this group is expanded, filter children too
    const visibleChildren = (children && filter)
      ? children.filter(c => matchesFilter(c, filter.toLowerCase()))
      : children;

    return (
      <li key={node.id} className="jp-GeoAgent-catalog-item">
        <div className="jp-GeoAgent-catalog-item-header" style={{ paddingLeft: depth * 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {node.hasChildren && (
                <button
                  onClick={() => toggleExpand(node)}
                  className="jp-GeoAgent-button-icon"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanding ? '...' : isExpanded ? '\u25BC' : '\u25B6'}
                </button>
              )}
              <span className="jp-GeoAgent-catalog-item-title">{node.title}</span>
            </div>
            <div className="jp-GeoAgent-catalog-item-desc">
              {node.description.length > 120
                ? node.description.slice(0, 120) + '...'
                : node.description}
            </div>
          </div>
          {!node.hasChildren && (
            <button
              onClick={() => addCollection(node.id)}
              disabled={addedIds.has(node.id) || !mapController}
              className="jp-GeoAgent-button jp-GeoAgent-button-small"
            >
              {addedIds.has(node.id) ? 'Added' : 'Add'}
            </button>
          )}
        </div>
        {isExpanded && visibleChildren && visibleChildren.length > 0 && (
          <ul className="jp-GeoAgent-catalog-list" style={{ margin: 0 }}>
            {visibleChildren.map(child => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="jp-GeoAgent-catalog">
      <div className="jp-GeoAgent-catalog-header">
        <h3>STAC Catalog</h3>
        <div className="jp-GeoAgent-catalog-url">
          <input
            type="text"
            value={catalogUrl}
            onChange={e => setCatalogUrl(e.target.value)}
            placeholder="STAC Catalog URL"
            className="jp-GeoAgent-input"
          />
          <button
            onClick={loadCatalog}
            disabled={loading}
            className="jp-GeoAgent-button"
          >
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>
      </div>

      {error && <div className="jp-GeoAgent-error">{error}</div>}

      {nodes.length > 0 && (
        <>
          <div className="jp-GeoAgent-catalog-filter">
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter collections..."
              className="jp-GeoAgent-input"
            />
          </div>

          <div className="jp-GeoAgent-catalog-count">
            {filtered.length} of {nodes.length} top-level entries
          </div>

          <ul className="jp-GeoAgent-catalog-list">
            {filtered.map(node => renderNode(node, 0))}
          </ul>
        </>
      )}
    </div>
  );
};
