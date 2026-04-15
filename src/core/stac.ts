/**
 * STAC Catalog browser — fetches and navigates STAC catalogs.
 *
 * Wraps geo-agent's DatasetCatalog for collection processing (extracting
 * map layers, parquet assets, columns, etc.) while adding an interactive
 * browsing layer on top: the user can load any catalog, see all collections,
 * and pick which ones to add to the map.
 *
 * This avoids reimplementing the STAC processing logic — bug fixes and
 * new asset type support in geo-agent flow here automatically.
 */

import { DatasetCatalog, DatasetEntry } from 'geo-agent/app/dataset-catalog.js';

export { DatasetEntry };

export interface CollectionStub {
  id: string;
  title: string;
  description: string;
  href: string;
}

export class STACBrowser {
  catalogUrl: string;
  titilerUrl: string;

  /** The underlying geo-agent DatasetCatalog used for processing. */
  catalog: DatasetCatalog;

  /** Raw STAC collection JSON, keyed by id. */
  private _rawCollections: Map<string, any> = new Map();

  constructor(catalogUrl: string, titilerUrl = 'https://titiler.nrp-nautilus.io') {
    this.catalogUrl = catalogUrl;
    this.titilerUrl = titilerUrl;

    // Initialize the geo-agent DatasetCatalog so we can delegate
    // processCollection to it.  Set catalogUrl and titilerUrl so its
    // internal URL resolution works.
    this.catalog = new DatasetCatalog();
    this.catalog.catalogUrl = catalogUrl;
    this.catalog.titilerUrl = titilerUrl;
  }

  /**
   * Fetch the root catalog and list all child collection stubs.
   * Returns basic metadata (id, title, description) without heavy
   * processing — that happens when the user adds a collection.
   */
  async listCollections(): Promise<CollectionStub[]> {
    const root = await this.fetchJson(this.catalogUrl);
    const childLinks = (root.links || []).filter((l: any) => l.rel === 'child');

    const results = await Promise.allSettled(
      childLinks.map(async (link: any) => {
        const url = new URL(link.href, this.catalogUrl).href;
        const col = await this.fetchJson(url);
        this._rawCollections.set(col.id, col);
        return {
          id: col.id,
          title: col.title || col.id,
          description: col.description || '',
          href: url,
        };
      })
    );

    return results
      .filter((r): r is PromiseFulfilledResult<CollectionStub> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  /**
   * Process a collection into a DatasetEntry (for adding to the map).
   *
   * Delegates to geo-agent's DatasetCatalog.processCollection so all
   * extraction logic (map layers, parquet assets, columns, child
   * expansion) is shared with the web app codebase.
   */
  async getDataset(collectionId: string): Promise<DatasetEntry | null> {
    // Already processed?
    const existing = this.catalog.get(collectionId);
    if (existing) return existing;

    const collection = this._rawCollections.get(collectionId);
    if (!collection) return null;

    // Delegate to geo-agent's processing pipeline
    return this.catalog.processCollection(collection, {});
  }

  /**
   * Get a previously processed dataset.
   */
  getLoadedDataset(id: string): DatasetEntry | null {
    return this.catalog.get(id);
  }

  /**
   * Get all loaded datasets.
   */
  getLoadedDatasets(): DatasetEntry[] {
    return this.catalog.getAll();
  }

  private async fetchJson(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  }
}
