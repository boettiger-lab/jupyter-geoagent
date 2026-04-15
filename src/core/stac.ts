/**
 * STAC Catalog browser — fetches and navigates STAC catalogs.
 *
 * Wraps geo-agent's DatasetCatalog for collection processing (extracting
 * map layers, parquet assets, columns, etc.) while adding an interactive
 * browsing layer on top: the user can load any catalog, see all collections,
 * and pick which ones to add to the map.
 *
 * Supports nested catalogs: a child link may point to a Collection that
 * itself contains child links (e.g. "High Seas" grouping 8 sub-collections).
 * These are represented as CatalogNode entries with children that can be
 * lazily loaded.
 */

import { DatasetCatalog, DatasetEntry } from 'geo-agent/app/dataset-catalog.js';

export { DatasetEntry };

export interface CatalogNode {
  id: string;
  title: string;
  description: string;
  href: string;
  /** True when this node has child links (is a group, not a leaf). */
  hasChildren: boolean;
  /** Populated lazily when the user expands a group. */
  children?: CatalogNode[];
}

/** Flat-compat alias used by components that don't need the tree. */
export type CollectionStub = CatalogNode;

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

    this.catalog = new DatasetCatalog();
    this.catalog.catalogUrl = catalogUrl;
    this.catalog.titilerUrl = titilerUrl;
  }

  /**
   * Fetch a catalog/collection at `url` and return its direct children
   * as CatalogNode entries.  Each node knows whether it has further
   * children (so the UI can show an expand affordance).
   */
  async listChildren(url: string): Promise<CatalogNode[]> {
    const json = await this.fetchJson(url);
    const childLinks = (json.links || []).filter((l: any) => l.rel === 'child');

    const results = await Promise.allSettled(
      childLinks.map(async (link: any) => {
        const childUrl = new URL(link.href, url).href;
        const col = await this.fetchJson(childUrl);
        this._rawCollections.set(col.id, col);

        const grandChildLinks = (col.links || []).filter((l: any) => l.rel === 'child');

        return {
          id: col.id,
          title: col.title || col.id,
          description: col.description || '',
          href: childUrl,
          hasChildren: grandChildLinks.length > 0,
        } as CatalogNode;
      })
    );

    return results
      .filter((r): r is PromiseFulfilledResult<CatalogNode> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  /**
   * Convenience wrapper: list children of the root catalog URL.
   */
  async listCollections(): Promise<CatalogNode[]> {
    return this.listChildren(this.catalogUrl);
  }

  /**
   * Expand a group node: fetch its children and attach them.
   */
  async expandNode(node: CatalogNode): Promise<CatalogNode[]> {
    if (node.children) return node.children;
    const children = await this.listChildren(node.href);
    node.children = children;
    return children;
  }

  /**
   * Process a collection into a DatasetEntry (for adding to the map).
   */
  async getDataset(collectionId: string): Promise<DatasetEntry | null> {
    const existing = this.catalog.get(collectionId);
    if (existing) return existing;

    const collection = this._rawCollections.get(collectionId);
    if (!collection) return null;

    return this.catalog.processCollection(collection, {});
  }

  getLoadedDataset(id: string): DatasetEntry | null {
    return this.catalog.get(id);
  }

  getLoadedDatasets(): DatasetEntry[] {
    return this.catalog.getAll();
  }

  private async fetchJson(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  }
}
