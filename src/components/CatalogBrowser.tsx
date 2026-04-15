/**
 * CatalogBrowser — sidebar panel for browsing STAC catalogs.
 *
 * 1. User enters a STAC catalog URL (or uses the default)
 * 2. Fetches the catalog, lists all collections
 * 3. User clicks "Add" on a collection → its visual assets are added to the map
 */

import * as React from 'react';
import { STACBrowser } from '../core/stac';
import { MapViewController } from './MapView';
import { ToolCallRecorder } from '../core/tools';

interface CollectionStub {
  id: string;
  title: string;
  description: string;
  href: string;
}

export interface CatalogBrowserProps {
  defaultCatalogUrl: string;
  titilerUrl: string;
  mapController: MapViewController | null;
  recorder: ToolCallRecorder;
  onDatasetAdded?: (datasetId: string) => void;
}

export const CatalogBrowser: React.FC<CatalogBrowserProps> = ({
  defaultCatalogUrl,
  titilerUrl,
  mapController,
  recorder,
  onDatasetAdded,
}) => {
  const [catalogUrl, setCatalogUrl] = React.useState(defaultCatalogUrl);
  const [collections, setCollections] = React.useState<CollectionStub[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [addedIds, setAddedIds] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState('');
  const browserRef = React.useRef<STACBrowser | null>(null);

  const loadCatalog = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setCollections([]);
    setAddedIds(new Set());

    try {
      const browser = new STACBrowser(catalogUrl, titilerUrl);
      browserRef.current = browser;
      const cols = await browser.listCollections();
      setCollections(cols.sort((a, b) => a.title.localeCompare(b.title)));
    } catch (e: any) {
      setError(e.message || 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [catalogUrl, titilerUrl]);

  // Auto-load on mount
  React.useEffect(() => {
    loadCatalog();
  }, []);

  const addCollection = React.useCallback(async (collectionId: string) => {
    if (!mapController || !browserRef.current) return;

    try {
      const dataset = await browserRef.current.getDataset(collectionId);
      if (!dataset) return;

      // Add each visual asset as a map layer
      for (const layer of dataset.mapLayers) {
        const layerId = mapController.addLayer(dataset.id, layer);
        mapController.showLayer(layerId);

        recorder.record('show_layer', { layer_id: layerId });
      }

      // Fly to the dataset's extent if available
      if (dataset.extent?.spatial?.bbox?.[0]) {
        const [west, south, east, north] = dataset.extent.spatial.bbox[0];
        const center: [number, number] = [(west + east) / 2, (south + north) / 2];
        mapController.flyTo(center);
        recorder.record('fly_to', { center, zoom: mapController.map.getZoom() });
      }

      setAddedIds(prev => new Set([...prev, collectionId]));
      if (onDatasetAdded) onDatasetAdded(collectionId);
    } catch (e: any) {
      console.error(`Failed to add collection ${collectionId}:`, e);
    }
  }, [mapController, recorder, onDatasetAdded]);

  const filtered = React.useMemo(() => {
    if (!filter) return collections;
    const q = filter.toLowerCase();
    return collections.filter(
      c => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }, [collections, filter]);

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

      {collections.length > 0 && (
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
                  <span className="jp-GeoAgent-catalog-item-title">{col.title}</span>
                  <button
                    onClick={() => addCollection(col.id)}
                    disabled={addedIds.has(col.id) || !mapController}
                    className="jp-GeoAgent-button jp-GeoAgent-button-small"
                  >
                    {addedIds.has(col.id) ? 'Added' : 'Add'}
                  </button>
                </div>
                <div className="jp-GeoAgent-catalog-item-desc">
                  {col.description.length > 150
                    ? col.description.slice(0, 150) + '...'
                    : col.description}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
