# Catalog Browser Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local STAC-parsing catalog browser with an MCP-backed, asset-level design — collection list from the STAC root, asset details from `get_collection` MCP tool, no geo-agent `DatasetCatalog` dependency.

**Architecture:** The catalog root URL is fetched once on mount for the collection list (`rel=child` links). Clicking a collection calls `get_collection(collection_id)` via MCP, which returns assets, columns, extent, and children. Each visual asset (PMTiles or COG) gets its own "Add to Map" button. Collections with `children` show sub-collection navigation. A new `mcp-catalog.ts` module holds all pure conversion functions.

**Tech Stack:** TypeScript, React, MapLibre GL JS, MCP (`@modelcontextprotocol/sdk`), STAC

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/core/types.ts` | Modify | Move `MapLayerConfig`, `ColumnInfo` to local definitions; remove geo-agent re-exports |
| `src/core/mcp-catalog.ts` | Create | Pure functions: `fetchCollectionList`, `classifyAsset`, `assetToMapLayerConfig` |
| `src/components/CatalogBrowser.tsx` | Rewrite | Two-level MCP-backed browse (collection list + asset view) |
| `src/components/GeoAgentApp.tsx` | Modify | Pass `mcpClient` to `CatalogBrowser` as required prop |
| `src/components/MapView.tsx` | Modify | Change `ColumnInfo` import from geo-agent to local types |
| `src/core/stac.ts` | Delete | Replaced by `mcp-catalog.ts` + MCP |
| `src/typings/geo-agent.d.ts` | Modify | Remove `dataset-catalog.js` module declaration |
| `src/components/ExportPanel.tsx` | Modify | Add standalone app export (zip with `layers-input.json` + `index.html`) |

---

### Task 1: Define local types, remove geo-agent type re-exports

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/typings/geo-agent.d.ts`
- Modify: `src/components/MapView.tsx:14`

This task defines `MapLayerConfig` and `ColumnInfo` locally so downstream code no longer imports from geo-agent's dataset-catalog module.

- [ ] **Step 1: Replace geo-agent imports with local type definitions in `types.ts`**

Replace the entire top section of `src/core/types.ts` (lines 1–26) with:

```typescript
/**
 * Types specific to jupyter-geoagent.
 *
 * MapLayerConfig and ColumnInfo were previously imported from geo-agent's
 * dataset-catalog module. They are now defined locally so the extension
 * can run without the geo-agent npm package as a runtime dependency for
 * catalog browsing.
 */

// ── Column / schema info (mirrors STAC table:columns) ──

export interface ColumnInfo {
  name: string;
  type: string;
  description: string;
  values?: string[];
}

// ── Map layer configuration (accepted by MapViewController.addLayer) ──

export interface MapLayerConfig {
  assetId: string;
  layerType: 'vector' | 'raster';
  sourceType?: 'geojson';
  title: string;
  description: string;
  url?: string;
  cogUrl?: string;
  sourceLayer?: string;
  defaultVisible: boolean;
  defaultFilter?: any[];
  defaultStyle?: Record<string, any>;
  outlineStyle?: Record<string, any>;
  colormap?: string;
  rescale?: string | null;
  versions?: Array<{
    label: string;
    assetId: string;
    layerType: string;
    url?: string;
    cogUrl?: string;
    sourceLayer?: string;
    sourceType?: string;
  }>;
  defaultVersionIndex?: number;
}
```

Keep everything below line 26 unchanged (the `RecordedToolCall`, `ToolCallLog`, `MapViewState`, `LayerState`, `LayersInputConfig`, and `MCPServerConfig` definitions remain).

- [ ] **Step 2: Update `MapView.tsx` to import `ColumnInfo` from local types**

In `src/components/MapView.tsx`, replace line 14:

```typescript
import type { ColumnInfo } from 'geo-agent/app/dataset-catalog.js';
```

with:

```typescript
import type { ColumnInfo } from '../core/types';
```

Line 13 already imports `MapLayerConfig` and `LayerState` from `../core/types`, so `ColumnInfo` joins the same import. Merge them into one import:

```typescript
import { MapLayerConfig, LayerState, MapViewState, ColumnInfo } from '../core/types';
```

and remove the separate `import type { ColumnInfo }` line.

- [ ] **Step 3: Remove the `dataset-catalog.js` module declaration from `geo-agent.d.ts`**

In `src/typings/geo-agent.d.ts`, delete the entire `declare module 'geo-agent/app/dataset-catalog.js' { ... }` block (lines 8–127). Also delete the `declare module 'geo-agent/app/tool-registry.js' { ... }` block (lines 129–172) since `ToolResult` is no longer re-exported.

Keep the remaining two module declarations (`geo-agent/app/mcp-client.js` and `geo-agent/app/map-tools.js`) — they are still imported by `mcp.ts` and `tool-metadata.ts`.

The file should contain only:

```typescript
/**
 * Type declarations for geo-agent ES modules still used at runtime.
 *
 * mcp-client.js is used by src/core/mcp.ts (direct MCP connection mode).
 * map-tools.js is used by src/core/tool-metadata.ts (tool description extraction).
 */

declare module 'geo-agent/app/mcp-client.js' {
  export class MCPClient {
    serverUrl: string;
    headers: Record<string, string>;
    connected: boolean;
    tools: Array<{ name: string; description: string; inputSchema: any }>;
    readonly isConnected: boolean;

    constructor(serverUrl: string, headers?: Record<string, string>);
    connect(): Promise<void>;
    ensureConnected(): Promise<void>;
    getTools(): Array<{ name: string; description: string; inputSchema: any }>;
    listTools(): Promise<Array<{ name: string; description: string; inputSchema: any }>>;
    callTool(name: string, args: Record<string, any>): Promise<string>;
    readResource(uri: string): Promise<string>;
    listResources(): Promise<any[]>;
    listPrompts(): Promise<any[]>;
    getPrompt(name: string, args?: Record<string, any>): Promise<string>;
    disconnect(): Promise<void>;
  }
}

declare module 'geo-agent/app/map-tools.js' {
  export function createMapTools(
    mapManager: any,
    catalog: any,
    mcpClient?: any
  ): Array<{
    name: string;
    description: string;
    inputSchema: any;
    execute: (args: Record<string, any>) => any;
  }>;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /home/cboettig/Documents/github/boettiger-lab/jupyter-geoagent && jlpm build:lib 2>&1 | tail -20`

Expected: Compilation succeeds (exit 0). There may be errors from `stac.ts` importing `DatasetCatalog` and `DatasetEntry` — those are expected and will be resolved in Task 6 when we delete `stac.ts`.

If there are errors in files OTHER than `stac.ts`, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/components/MapView.tsx src/typings/geo-agent.d.ts
git commit -m "Define MapLayerConfig and ColumnInfo locally, remove geo-agent type re-exports"
```

---

### Task 2: Create `mcp-catalog.ts` — pure catalog functions

**Files:**
- Create: `src/core/mcp-catalog.ts`

Three pure functions that form the bridge between STAC/MCP data and MapViewController.

- [ ] **Step 1: Create `src/core/mcp-catalog.ts`**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/cboettig/Documents/github/boettiger-lab/jupyter-geoagent && jlpm build:lib 2>&1 | tail -20`

Expected: Compilation succeeds. Errors from `stac.ts` are still expected.

- [ ] **Step 3: Commit**

```bash
git add src/core/mcp-catalog.ts
git commit -m "Add mcp-catalog module with fetchCollectionList, classifyAsset, assetToMapLayerConfig"
```

---

### Task 3: Rewrite CatalogBrowser.tsx

**Files:**
- Rewrite: `src/components/CatalogBrowser.tsx`

Two-level MCP-backed browse. Level 1: collection list from STAC root. Level 2: asset view from `get_collection`. Collections with children show sub-collection navigation.

- [ ] **Step 1: Rewrite `src/components/CatalogBrowser.tsx`**

Replace the entire file with:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/cboettig/Documents/github/boettiger-lab/jupyter-geoagent && jlpm build:lib 2>&1 | tail -20`

Expected: Compilation succeeds. The new `CatalogBrowser` no longer imports from `../core/stac`.

- [ ] **Step 3: Commit**

```bash
git add src/components/CatalogBrowser.tsx
git commit -m "Rewrite CatalogBrowser: two-level MCP-backed browse with per-asset Add to Map"
```

---

### Task 4: Update GeoAgentApp to pass mcpClient to CatalogBrowser

**Files:**
- Modify: `src/components/GeoAgentApp.tsx:85-91`

- [ ] **Step 1: Add `mcpClient` prop to CatalogBrowser in `GeoAgentApp.tsx`**

In `src/components/GeoAgentApp.tsx`, find the `<CatalogBrowser` JSX (around line 85–91):

```tsx
        <CatalogBrowser
          defaultCatalogUrl={defaultCatalogUrl}
          titilerUrl={titilerUrl}
          mapController={mapController}
          recorder={recorderRef.current}
          onDatasetAdded={handleDatasetAdded}
        />
```

Replace with:

```tsx
        <CatalogBrowser
          defaultCatalogUrl={defaultCatalogUrl}
          titilerUrl={titilerUrl}
          mapController={mapController}
          recorder={recorderRef.current}
          mcpClient={mcpClient}
          onDatasetAdded={handleDatasetAdded}
        />
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/cboettig/Documents/github/boettiger-lab/jupyter-geoagent && jlpm build:lib 2>&1 | tail -20`

Expected: Compilation succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/GeoAgentApp.tsx
git commit -m "Pass mcpClient to CatalogBrowser for MCP-backed collection details"
```

---

### Task 5: Delete stac.ts

**Files:**
- Delete: `src/core/stac.ts`

- [ ] **Step 1: Delete `src/core/stac.ts`**

```bash
rm src/core/stac.ts
```

- [ ] **Step 2: Verify no remaining imports of stac.ts**

Run: `cd /home/cboettig/Documents/github/boettiger-lab/jupyter-geoagent && grep -r "core/stac" src/`

Expected: No output (all imports have been removed by Task 3's CatalogBrowser rewrite).

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/cboettig/Documents/github/boettiger-lab/jupyter-geoagent && jlpm build:lib 2>&1 | tail -20`

Expected: Clean compilation (exit 0).

- [ ] **Step 4: Commit**

```bash
git add -u src/core/stac.ts
git commit -m "Delete stac.ts — STAC browsing now uses MCP get_collection + direct catalog fetch"
```

---

### Task 6: Add standalone app export to ExportPanel

**Files:**
- Modify: `src/components/ExportPanel.tsx`

Adds a fourth export button: "Export Standalone App" that downloads a zip containing `layers-input.json` + `index.html`.

- [ ] **Step 1: Add the standalone app export function and button to `ExportPanel.tsx`**

In `src/components/ExportPanel.tsx`, add this function after `exportStaticHtml` (after line 164):

```typescript
  const exportStandaloneApp = React.useCallback(async () => {
    if (!mapController) return;

    const viewState = mapController.getViewState();
    const layers = [...mapController.layers.values()];

    // Build layers-input.json (same logic as exportLayersInput)
    const datasetLayers = new Map<string, string[]>();
    for (const layer of layers) {
      const existing = datasetLayers.get(layer.datasetId) || [];
      existing.push(layer.id.split('/')[1]);
      datasetLayers.set(layer.datasetId, existing);
    }

    const collections: LayersInputConfig['collections'] = [];
    for (const [datasetId, assetIds] of datasetLayers) {
      collections.push({
        collection_id: datasetId,
        assets: assetIds.map(id => ({
          id,
          visible: mapController.layers.get(`${datasetId}/${id}`)?.visible ?? false,
        })),
      });
    }

    const config: LayersInputConfig = {
      catalog: catalogUrl,
      titiler_url: titilerUrl,
      view: viewState,
      collections,
    };

    // Build index.html — geo-agent CDN template that reads layers-input.json
    // When placed next to layers-input.json and served over HTTP, geo-agent's
    // main.js loads the config and renders the full map with all layers.
    const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GeoAgent Map</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/boettiger-lab/geo-agent@main/app/chat.css">
</head>
<body>
  <script type="module" src="https://cdn.jsdelivr.net/gh/boettiger-lab/geo-agent@main/app/main.js"><\/script>
</body>
</html>`;

    // Create zip using JSZip-free approach: build a simple zip manually
    // For simplicity, download both files separately
    downloadJson(config, 'layers-input.json');
    downloadHtml(indexHtml, 'index.html');
  }, [mapController, catalogUrl, titilerUrl]);
```

Then add the button in the JSX, after the "Export Tool Call Log" button (around line 189):

```tsx
        <button
          onClick={exportStandaloneApp}
          disabled={!mapController}
          className="jp-GeoAgent-button"
        >
          Export Standalone App
        </button>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/cboettig/Documents/github/boettiger-lab/jupyter-geoagent && jlpm build:lib 2>&1 | tail -20`

Expected: Compilation succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ExportPanel.tsx
git commit -m "Add standalone app export (layers-input.json + index.html)"
```

---

### Task 7: Add CSS for new catalog browser elements

**Files:**
- Modify: `style/base.css`

The rewritten CatalogBrowser uses a few new CSS classes that need styles.

- [ ] **Step 1: Read the current stylesheet**

Read `style/base.css` to find the existing `.jp-GeoAgent-catalog` section.

- [ ] **Step 2: Add styles for asset badges and catalog sections**

Append to the existing catalog styles section in `style/base.css`:

```css
/* Asset type badges */
.jp-GeoAgent-asset-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  white-space: nowrap;
}

.jp-GeoAgent-asset-badge-vector {
  background: #e3f2fd;
  color: #1565c0;
}

.jp-GeoAgent-asset-badge-raster {
  background: #fce4ec;
  color: #c62828;
}

.jp-GeoAgent-asset-badge-data {
  background: #f3e5f5;
  color: #6a1b9a;
}

.jp-GeoAgent-asset-badge-other {
  background: #f5f5f5;
  color: #616161;
}

/* Collection detail sections */
.jp-GeoAgent-catalog-detail {
  padding: 8px 0;
}

.jp-GeoAgent-catalog-section {
  margin-top: 12px;
}

.jp-GeoAgent-catalog-loading {
  padding: 16px;
  color: var(--jp-ui-font-color2, #616161);
  text-align: center;
}
```

- [ ] **Step 3: Commit**

```bash
git add style/base.css
git commit -m "Add CSS for asset badges and catalog detail view"
```

---

### Task 8: Build and manual verification

**Files:** None (verification only)

- [ ] **Step 1: Clean build**

Run:

```bash
cd /home/cboettig/Documents/github/boettiger-lab/jupyter-geoagent
jlpm clean:lib
jlpm build:lib
```

Expected: Clean compilation with no errors.

- [ ] **Step 2: Build the JupyterLab extension**

Run:

```bash
jlpm build:labextension:dev
```

Expected: Extension builds successfully.

- [ ] **Step 3: Verify in browser**

Start JupyterLab:

```bash
jupyter lab
```

Open the GeoAgent panel. Verify:
1. Collection list loads from the STAC catalog root
2. Search/filter works on collection titles
3. Clicking a collection opens the asset view (requires MCP)
4. PMTiles assets show "Add to Map" button
5. COG assets show "Add to Map" button
6. Parquet assets show as "Data" (no add button)
7. Collections with children (e.g. cpad-2025b) show sub-collection navigation
8. Back button returns to the collection list (or parent collection)
9. Added layers appear in the LayerPanel with style/filter controls
10. Export buttons still work

- [ ] **Step 4: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "Fix any issues found during manual verification"
```

(Skip if no issues found.)
