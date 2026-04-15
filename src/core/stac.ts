/**
 * STAC Catalog browser — fetches and navigates STAC catalogs.
 *
 * Unlike geo-agent's DatasetCatalog (which loads a pre-configured list),
 * this is an interactive browser: load a catalog, list its collections,
 * and process individual collections on demand as the user adds them.
 */

import {
  STACCatalog,
  STACCollection,
  STACAsset,
  DatasetEntry,
  MapLayerConfig,
  ParquetAsset,
  ColumnInfo
} from './types';

export class STACBrowser {
  catalogUrl: string;
  titilerUrl: string;
  private _collections: Map<string, STACCollection> = new Map();
  private _datasets: Map<string, DatasetEntry> = new Map();

  constructor(catalogUrl: string, titilerUrl = 'https://titiler.nrp-nautilus.io') {
    this.catalogUrl = catalogUrl;
    this.titilerUrl = titilerUrl;
  }

  /**
   * Fetch the root catalog and list all child collection stubs.
   * Returns basic metadata (id, title, description) without fetching
   * each collection in full — that happens when the user adds one.
   */
  async listCollections(): Promise<Array<{ id: string; title: string; description: string; href: string }>> {
    const catalog: STACCatalog = await this.fetchJson(this.catalogUrl);
    const childLinks = (catalog.links || []).filter(l => l.rel === 'child');

    const results = await Promise.allSettled(
      childLinks.map(async (link) => {
        const url = new URL(link.href, this.catalogUrl).href;
        const col: STACCollection = await this.fetchJson(url);
        this._collections.set(col.id, col);
        return {
          id: col.id,
          title: col.title || col.id,
          description: col.description || '',
          href: url,
        };
      })
    );

    return results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  /**
   * Process a collection into a DatasetEntry (for adding to the map).
   * If the collection was already fetched during listCollections, uses the cache.
   */
  async getDataset(collectionId: string): Promise<DatasetEntry | null> {
    if (this._datasets.has(collectionId)) {
      return this._datasets.get(collectionId)!;
    }

    const collection = this._collections.get(collectionId);
    if (!collection) return null;

    const entry = this.processCollection(collection);
    this._datasets.set(collectionId, entry);
    return entry;
  }

  /**
   * Get a previously processed dataset.
   */
  getLoadedDataset(id: string): DatasetEntry | null {
    return this._datasets.get(id) || null;
  }

  /**
   * Get all loaded datasets.
   */
  getLoadedDatasets(): DatasetEntry[] {
    return [...this._datasets.values()];
  }

  /**
   * Process a STAC collection into a DatasetEntry.
   */
  private processCollection(collection: STACCollection): DatasetEntry {
    const assets = collection.assets || {};
    const mapLayers = this.extractMapLayers(collection, assets);
    const parquetAssets = this.extractParquetAssets(assets);
    const columns = this.extractColumns(collection);

    const producers = (collection.providers || []).filter(
      p => (p.roles || []).includes('producer')
    );

    // Look for a thumbnail asset
    let thumbnail: string | undefined;
    for (const [, asset] of Object.entries(assets)) {
      if (asset.type?.startsWith('image/') && asset.href) {
        thumbnail = asset.href;
        break;
      }
    }

    return {
      id: collection.id,
      title: collection.title || collection.id,
      description: collection.description || '',
      license: collection.license || 'N/A',
      keywords: collection.keywords || [],
      provider: producers[0]?.name || 'Unknown',
      columns,
      mapLayers,
      parquetAssets,
      extent: collection.extent,
      thumbnail,
    };
  }

  /**
   * Extract visual map layers (PMTiles, GeoJSON, COG) from STAC assets.
   */
  private extractMapLayers(collection: STACCollection, assets: Record<string, STACAsset>): MapLayerConfig[] {
    const layers: MapLayerConfig[] = [];

    for (const [assetId, asset] of Object.entries(assets)) {
      const type = asset.type || '';

      if (type.includes('pmtiles')) {
        layers.push({
          assetId,
          layerType: 'vector',
          title: asset.title || assetId,
          description: asset.description || '',
          url: asset.href,
          sourceLayer: asset['vector:layers']?.[0] || asset['pmtiles:layer'] || assetId,
          defaultVisible: false,
          defaultFilter: undefined,
          defaultStyle: undefined,
        });
      } else if (type.includes('geotiff') || type.includes('tiff')) {
        layers.push({
          assetId,
          layerType: 'raster',
          title: asset.title || assetId,
          description: asset.description || '',
          cogUrl: asset.href,
          colormap: 'reds',
          defaultVisible: false,
        });
      } else if (type.includes('geo+json') || asset.href?.endsWith('.geojson')) {
        layers.push({
          assetId,
          layerType: 'vector',
          sourceType: 'geojson',
          title: asset.title || assetId,
          description: asset.description || '',
          url: asset.href,
          defaultVisible: false,
        });
      }
    }

    return layers;
  }

  /**
   * Extract parquet assets for SQL queries.
   */
  private extractParquetAssets(assets: Record<string, STACAsset>): ParquetAsset[] {
    const result: ParquetAsset[] = [];

    for (const [assetId, asset] of Object.entries(assets)) {
      const type = asset.type || '';
      const href = asset.href || '';

      if (type.includes('parquet') || href.endsWith('.parquet') || href.endsWith('/hex/') || href.endsWith('/hex//')) {
        let s3Path = href;
        if (href.startsWith('https://s3-west.nrp-nautilus.io/')) {
          s3Path = href.replace('https://s3-west.nrp-nautilus.io/', 's3://');
        }
        if (s3Path.endsWith('/') || s3Path.endsWith('//')) {
          s3Path = s3Path.replace(/\/+$/, '') + '/**';
        }

        result.push({
          assetId,
          title: asset.title || assetId,
          s3Path,
          originalUrl: href,
          isPartitioned: href.endsWith('/') || href.endsWith('//'),
          description: asset.description || '',
        });
      }
    }

    return result;
  }

  /**
   * Extract table:columns schema info.
   */
  private extractColumns(collection: STACCollection): ColumnInfo[] {
    const columns = collection['table:columns'] || [];
    return columns
      .filter(col => !['geometry', 'geom'].includes(col.name?.toLowerCase()))
      .map(col => ({
        name: col.name,
        type: col.type || 'string',
        description: col.description || '',
        ...(col.values?.length ? { values: col.values } : {}),
      }));
  }

  private async fetchJson(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  }
}
