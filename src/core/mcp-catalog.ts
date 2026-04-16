/**
 * mcp-catalog — pure functions for STAC catalog browsing and asset→layer conversion.
 *
 * No React, no geo-agent imports. These functions bridge MCP/STAC data
 * into the shapes MapViewController.addLayer() expects.
 */

import { MapLayerConfig, ColumnInfo } from './types';

// ── Types for STAC catalog data ──

export interface CollectionStub {
  id: string;
  title: string;
}

/** Shape returned by the MCP get_collection tool. */
export interface MCPCollection {
  id: string;
  title: string;
  description: string;
  extent?: {
    spatial?: { bbox?: number[][] };
    temporal?: { interval?: string[][] };
  };
  assets: Record<string, MCPAsset>;
  children: string[];
  'table:columns'?: Array<{ name: string; type: string; description: string; values?: string[] }>;
  [key: string]: any;
}

export interface MCPAsset {
  href: string;
  type: string;
  title?: string;
  description?: string;
  'vector:layers'?: string[];
  'file:size'?: number;
  [key: string]: any;
}

export type AssetClass = 'vector' | 'raster' | 'data' | 'other';

// ── Functions ──

/**
 * Fetch the STAC catalog root and extract { id, title } for each child collection.
 *
 * STAC catalog JSON has `links` with `rel=child`, each carrying `id`, `title`, and `href`.
 * We only need id+title for the collection picker — no need to fetch each child.
 */
export async function fetchCollectionList(catalogUrl: string): Promise<CollectionStub[]> {
  const response = await fetch(catalogUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch catalog: HTTP ${response.status}`);
  }
  const catalog = await response.json();
  const links: any[] = catalog.links || [];

  return links
    .filter((link: any) => link.rel === 'child')
    .map((link: any) => ({
      id: link.id || extractIdFromHref(link.href),
      title: link.title || link.id || extractIdFromHref(link.href),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Extract a collection ID from a STAC child href.
 * e.g. "https://s3-west.nrp-nautilus.io/public-cpad/stac-collection.json" → "public-cpad"
 * Fallback when the link has no `id` field.
 */
function extractIdFromHref(href: string): string {
  try {
    const url = new URL(href);
    const parts = url.pathname.split('/').filter(Boolean);
    // Drop the filename (e.g. "stac-collection.json", "collection.json")
    return parts.length > 1 ? parts[parts.length - 2] : parts[0] || href;
  } catch {
    return href;
  }
}

/**
 * Classify a STAC asset by MIME type.
 */
export function classifyAsset(asset: MCPAsset): AssetClass {
  const type = (asset.type || '').toLowerCase();
  if (type.includes('pmtiles')) return 'vector';
  if (type.includes('geo+json') || asset.href?.endsWith('.geojson')) return 'vector';
  if (type.includes('geotiff') || type.includes('tiff')) return 'raster';
  if (type.includes('parquet')) return 'data';
  return 'other';
}

/**
 * Convert a single STAC asset (from MCP get_collection JSON) into the
 * MapLayerConfig shape that MapViewController.addLayer() expects.
 *
 * `s3Endpoint` is the HTTPS base for resolving s3:// hrefs
 * (e.g. "https://s3-west.nrp-nautilus.io"). Derived from the catalog URL.
 */
export function assetToMapLayerConfig(
  collectionId: string,
  assetId: string,
  asset: MCPAsset,
  s3Endpoint: string,
  titilerUrl: string,
): MapLayerConfig | null {
  const cls = classifyAsset(asset);
  const href = resolveHref(asset.href, s3Endpoint);

  if (cls === 'vector') {
    const isGeoJson = (asset.type || '').includes('geo+json') || href.endsWith('.geojson');
    return {
      assetId,
      layerType: 'vector',
      sourceType: isGeoJson ? 'geojson' : undefined,
      title: asset.title || assetId,
      description: asset.description || '',
      url: href,
      sourceLayer: asset['vector:layers']?.[0] || collectionId,
      defaultVisible: true,
      defaultFilter: undefined,
      defaultStyle: undefined,
    };
  }

  if (cls === 'raster') {
    return {
      assetId,
      layerType: 'raster',
      title: asset.title || assetId,
      description: asset.description || '',
      cogUrl: href,
      colormap: 'reds',
      rescale: null,
      defaultVisible: true,
    };
  }

  // Non-visual assets (parquet, other) are not addable to the map.
  return null;
}

/**
 * Extract ColumnInfo from MCP get_collection response.
 * Filters out geometry columns.
 */
export function extractColumns(collection: MCPCollection): ColumnInfo[] {
  const columns = collection['table:columns'] || [];
  return columns
    .filter(col => !['geometry', 'geom', 'bbox'].includes(col.name?.toLowerCase()))
    .map(col => ({
      name: col.name,
      type: col.type || 'string',
      description: col.description || '',
      ...(col.values?.length ? { values: col.values } : {}),
    }));
}

/**
 * Derive the S3-to-HTTPS endpoint from a catalog URL.
 * e.g. "https://s3-west.nrp-nautilus.io/public-data/stac/catalog.json" → "https://s3-west.nrp-nautilus.io"
 */
export function deriveS3Endpoint(catalogUrl: string): string {
  try {
    const url = new URL(catalogUrl);
    return url.origin;
  } catch {
    return 'https://s3-west.nrp-nautilus.io';
  }
}

/**
 * Resolve an s3:// href to an HTTPS URL, or return as-is if already HTTPS.
 * e.g. "s3://public-cpad/file.pmtiles" → "https://s3-west.nrp-nautilus.io/public-cpad/file.pmtiles"
 */
function resolveHref(href: string, s3Endpoint: string): string {
  if (href.startsWith('s3://')) {
    return href.replace('s3://', `${s3Endpoint}/`);
  }
  return href;
}
