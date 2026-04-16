/**
 * CatalogBrowser — browse STAC collections and add individual assets to the map.
 *
 * Level 1: Collection list fetched from the STAC catalog root URL.
 * Level 2: Asset view fetched via MCP get_collection(collection_id).
 *
 * Collections with children (sub-collections) show navigation links.
 * Each visual asset (PMTiles/COG) gets its own "Add to Map" button.
 */

import * as React from 'react';
import { MapViewController } from './MapView';
import { ToolCallRecorder } from '../core/tools';
import { MCPClientWrapper } from '../core/mcp';
import {
  fetchCollectionList,
  classifyAsset,
  assetToMapLayerConfig,
  extractColumns,
  deriveS3Endpoint,
  CollectionStub,
  MCPCollection,
  MCPAsset,
  AssetClass,
} from '../core/mcp-catalog';

export interface CatalogBrowserProps {
  defaultCatalogUrl: string;
  titilerUrl: string;
  mapController: MapViewController | null;
  recorder: ToolCallRecorder;
  mcpClient: MCPClientWrapper | null;
  onDatasetAdded?: (datasetId: string, firstLayerId?: string) => void;
}

export const CatalogBrowser: React.FC<CatalogBrowserProps> = ({
  defaultCatalogUrl,
  titilerUrl,
  mapController,
  recorder,
  mcpClient,
  onDatasetAdded,
}) => {
  const [catalogUrl, setCatalogUrl] = React.useState(defaultCatalogUrl);
  const [collections, setCollections] = React.useState<CollectionStub[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState('');

  // Level 2 state: which collection is open
  const [activeCollection, setActiveCollection] = React.useState<MCPCollection | null>(null);
  const [activeLoading, setActiveLoading] = React.useState(false);
  const [activeError, setActiveError] = React.useState<string | null>(null);

  // Track which assets have been added
  const [addedAssets, setAddedAssets] = React.useState<Set<string>>(new Set());

  // Navigation stack for nested collections
  const [navStack, setNavStack] = React.useState<string[]>([]);

  const s3Endpoint = React.useMemo(() => deriveS3Endpoint(catalogUrl), [catalogUrl]);

  // ── Level 1: Load collection list from STAC root ──

  const loadCatalog = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setCollections([]);
    setActiveCollection(null);
    setNavStack([]);
    setAddedAssets(new Set());

    try {
      const list = await fetchCollectionList(catalogUrl);
      setCollections(list);
    } catch (e: any) {
      setError(e.message || 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [catalogUrl]);

  React.useEffect(() => {
    loadCatalog();
  }, []);

  // ── Level 2: Open a collection's asset view ──

  const openCollection = React.useCallback(async (collectionId: string) => {
    if (!mcpClient) {
      setActiveError('MCP connection required to view collection details.');
      return;
    }

    setActiveLoading(true);
    setActiveError(null);
    setActiveCollection(null);

    try {
      const raw = await mcpClient.callTool('get_collection', { collection_id: collectionId });
      const parsed: MCPCollection = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed.error) {
        setActiveError(String(parsed.error));
      } else {
        setActiveCollection(parsed);
      }
    } catch (e: any) {
      setActiveError(e.message || 'Failed to load collection');
    } finally {
      setActiveLoading(false);
    }
  }, [mcpClient]);

  const handleCollectionClick = React.useCallback((collectionId: string) => {
    setNavStack(prev => [...prev, collectionId]);
    openCollection(collectionId);
  }, [openCollection]);

  const handleBack = React.useCallback(() => {
    setNavStack(prev => {
      const next = prev.slice(0, -1);
      if (next.length === 0) {
        setActiveCollection(null);
        setActiveError(null);
      } else {
        openCollection(next[next.length - 1]);
      }
      return next;
    });
  }, [openCollection]);

  // ── Add an asset to the map ──

  const addAsset = React.useCallback((collectionId: string, assetId: string, asset: MCPAsset) => {
    if (!mapController || !activeCollection) return;

    const config = assetToMapLayerConfig(collectionId, assetId, asset, s3Endpoint, titilerUrl);
    if (!config) return;

    const columns = extractColumns(activeCollection);
    const layerId = mapController.addLayer(collectionId, config, columns);
    mapController.showLayer(layerId);
    recorder.record('show_layer', { layer_id: layerId });

    // Fly to collection extent
    const bbox = activeCollection.extent?.spatial?.bbox?.[0];
    if (bbox) {
      const [west, south, east, north] = bbox;
      const center: [number, number] = [(west + east) / 2, (south + north) / 2];
      mapController.flyTo(center);
      recorder.record('fly_to', { center, zoom: mapController.map.getZoom() });
    }

    setAddedAssets(prev => new Set([...prev, `${collectionId}/${assetId}`]));
    if (onDatasetAdded) onDatasetAdded(collectionId, layerId);
  }, [mapController, activeCollection, s3Endpoint, titilerUrl, recorder, onDatasetAdded]);

  // ── Filtering ──

  const filtered = React.useMemo(() => {
    if (!filter) return collections;
    const q = filter.toLowerCase();
    return collections.filter(c =>
      c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }, [collections, filter]);

  // ── Render helpers ──

  const renderAssetBadge = (cls: AssetClass): React.ReactNode => {
    const labels: Record<AssetClass, string> = {
      vector: 'Vector',
      raster: 'Raster',
      data: 'Data',
      other: 'Other',
    };
    return <span className={`jp-GeoAgent-asset-badge jp-GeoAgent-asset-badge-${cls}`}>{labels[cls]}</span>;
  };

  // ── Level 2: Asset view ──

  const renderAssetView = (): React.ReactNode => {
    if (activeLoading) {
      return <div className="jp-GeoAgent-catalog-loading">Loading collection...</div>;
    }
    if (activeError) {
      return <div className="jp-GeoAgent-error">{activeError}</div>;
    }
    if (!activeCollection) return null;

    const assetEntries = Object.entries(activeCollection.assets || {});
    const children = activeCollection.children || [];

    // Classify assets
    const classified = assetEntries.map(([id, asset]) => ({
      id,
      asset,
      cls: classifyAsset(asset),
    }));

    const visual = classified.filter(a => a.cls === 'vector' || a.cls === 'raster');
    const data = classified.filter(a => a.cls === 'data');
    const other = classified.filter(a => a.cls === 'other');

    return (
      <div className="jp-GeoAgent-catalog-detail">
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={handleBack}>
          &larr; Back
        </button>
        <h4>{activeCollection.title}</h4>
        {activeCollection.description && (
          <p className="jp-GeoAgent-catalog-item-desc">{activeCollection.description}</p>
        )}

        {/* Sub-collections */}
        {children.length > 0 && (
          <div className="jp-GeoAgent-catalog-section">
            <div className="jp-GeoAgent-field-label"><span>Sub-collections</span></div>
            <ul className="jp-GeoAgent-catalog-list">
              {children.map(childId => (
                <li key={childId} className="jp-GeoAgent-catalog-item">
                  <div className="jp-GeoAgent-catalog-item-header">
                    <span className="jp-GeoAgent-catalog-item-title">{childId}</span>
                    <button
                      className="jp-GeoAgent-button jp-GeoAgent-button-small"
                      onClick={() => handleCollectionClick(childId)}
                    >
                      View
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Visual assets (addable) */}
        {visual.length > 0 && (
          <div className="jp-GeoAgent-catalog-section">
            <div className="jp-GeoAgent-field-label"><span>Visual assets</span></div>
            <ul className="jp-GeoAgent-catalog-list">
              {visual.map(({ id, asset, cls }) => {
                const key = `${activeCollection.id}/${id}`;
                const added = addedAssets.has(key);
                return (
                  <li key={id} className="jp-GeoAgent-catalog-item">
                    <div className="jp-GeoAgent-catalog-item-header">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {renderAssetBadge(cls)}
                          <span className="jp-GeoAgent-catalog-item-title">
                            {asset.title || id}
                          </span>
                        </div>
                        {asset.description && (
                          <div className="jp-GeoAgent-catalog-item-desc">{asset.description}</div>
                        )}
                      </div>
                      <button
                        className="jp-GeoAgent-button jp-GeoAgent-button-small"
                        onClick={() => addAsset(activeCollection.id, id, asset)}
                        disabled={added || !mapController}
                      >
                        {added ? 'Added' : 'Add to Map'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Data assets (informational) */}
        {data.length > 0 && (
          <div className="jp-GeoAgent-catalog-section">
            <div className="jp-GeoAgent-field-label"><span>Data assets (not visual)</span></div>
            <ul className="jp-GeoAgent-catalog-list">
              {data.map(({ id, asset, cls }) => (
                <li key={id} className="jp-GeoAgent-catalog-item">
                  <div className="jp-GeoAgent-catalog-item-header">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {renderAssetBadge(cls)}
                        <span className="jp-GeoAgent-catalog-item-title">
                          {asset.title || id}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Other assets */}
        {other.length > 0 && (
          <div className="jp-GeoAgent-catalog-section">
            <div className="jp-GeoAgent-field-label"><span>Other assets</span></div>
            <ul className="jp-GeoAgent-catalog-list">
              {other.map(({ id, asset, cls }) => (
                <li key={id} className="jp-GeoAgent-catalog-item">
                  <div className="jp-GeoAgent-catalog-item-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {renderAssetBadge(cls)}
                      <span className="jp-GeoAgent-catalog-item-title">
                        {asset.title || id}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {assetEntries.length === 0 && children.length === 0 && (
          <p className="jp-GeoAgent-empty">This collection has no assets or sub-collections.</p>
        )}
      </div>
    );
  };

  // ── Main render ──

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

      {/* Level 2: Asset view (when a collection is open) */}
      {navStack.length > 0 && renderAssetView()}

      {/* Level 1: Collection list (when no collection is open) */}
      {navStack.length === 0 && collections.length > 0 && (
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
            {filtered.length} of {collections.length} collections
          </div>

          <ul className="jp-GeoAgent-catalog-list">
            {filtered.map(col => (
              <li key={col.id} className="jp-GeoAgent-catalog-item">
                <div className="jp-GeoAgent-catalog-item-header">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="jp-GeoAgent-catalog-item-title">{col.title}</span>
                    <div className="jp-GeoAgent-catalog-item-desc">{col.id}</div>
                  </div>
                  <button
                    className="jp-GeoAgent-button jp-GeoAgent-button-small"
                    onClick={() => handleCollectionClick(col.id)}
                    disabled={!mcpClient}
                  >
                    View
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {navStack.length === 0 && collections.length === 0 && !loading && !error && (
        <p className="jp-GeoAgent-empty">
          {mcpClient
            ? 'No collections found. Check the catalog URL.'
            : 'Connecting to MCP server...'}
        </p>
      )}
    </div>
  );
};
