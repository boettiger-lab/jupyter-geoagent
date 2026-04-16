# Catalog Browser Redesign — Design Spec

**Date:** 2026-04-16

**Goal:** Replace the local STAC-parsing catalog browser with an MCP-backed
design where jupyter-geoagent is a peer MCP client alongside geo-agent, both
consuming the same `duckdb-geo` MCP server. The browser operates at the
*asset* level (not collection level), leans entirely on MCP tools for catalog
data, and maintains export compatibility with geo-agent's standalone app
format.

---

## 1. Architecture

The catalog browser uses two data sources:

1. **STAC catalog root (HTTP fetch)** — The catalog URL (a standard STAC
   endpoint) returns JSON with `rel=child` links listing collections. A
   single fetch gives us `{ id, title }` pairs for the collection picker.
   This is plain STAC — no MCP tool needed.
2. **`get_collection(collection_id)` (MCP call)** — returns structured JSON
   with assets, metadata, and spatial extent for a single collection (the
   "asset view").

No `STACBrowser` class. No geo-agent `DatasetCatalog.processCollection()`.
No `browse_stac_catalog` markdown parsing. The collection list comes from
standard STAC; asset details come from MCP.

MCP is **required** for the asset view — it is the whole point of this
extension. If no MCP connection is available, the catalog tab shows a
connection prompt instead of an empty tree.

### Data flow

```
┌─────────────────┐      fetch()          ┌──────────────┐
│  CatalogBrowser │ ───────────────────▶   │  STAC catalog│
│  (React)        │ ◀─────────────────── │  (JSON)      │
│                 │                        └──────────────┘
│                 │      callTool()        ┌──────────────┐
│                 │ ───────────────────▶   │  MCP server  │
│                 │ ◀─────────────────── │  (duckdb-geo) │
└────────┬────────┘                        └──────────────┘
         │
         │ assetToMapLayerConfig()
         ▼
┌─────────────────┐
│ MapViewController│
│ .addLayer()     │
└─────────────────┘
```

---

## 2. Component changes

### CatalogBrowser.tsx — rewrite

**Before:** Uses `STACBrowser` class (local HTTP), shows collections with a
single "Add" button per collection, expands groups via `expandNode()`.

**After:** Two-level MCP-backed browse:

- **Level 1 — Collection list.** On mount, fetches the STAC catalog root
  URL and extracts `{ id, title }` pairs from `rel=child` links in the
  response JSON. Renders a searchable/filterable list. Clicking a
  collection opens level 2.
- **Level 2 — Asset view.** Calls `get_collection(collection_id)`. Displays
  collection metadata (title, description, spatial/temporal extent) and lists
  individual assets classified by MIME type:
  - `application/vnd.pmtiles` → **vector** (PMTiles)
  - `image/tiff; application=geotiff; profile=cloud-optimized` → **raster** (COG)
  - `application/vnd.apache.parquet` → **data** (GeoParquet, non-visual)
  - Everything else → **other** (shown but not addable)

  Each visual asset (vector or raster) gets its own **"Add to Map"** button.
  Data assets are listed for reference. A back button returns to level 1.

### New module: src/core/mcp-catalog.ts

Pure functions, no React, no geo-agent imports:

- **`fetchCollectionList(catalogUrl: string): Promise<Array<{ id: string; title: string }>>`**
  — Fetches the STAC catalog root URL, extracts `rel=child` links, returns
  `{ id, title }` pairs. Pure STAC — no MCP dependency.

- **`classifyAsset(asset: object): 'vector' | 'raster' | 'data' | 'other'`**
  — Classifies a STAC asset by its MIME type.

- **`assetToMapLayerConfig(collectionId, assetId, asset, collectionExtent?)`**
  — Converts a single STAC asset from `get_collection` JSON into the config
  shape that `MapViewController.addLayer()` expects. The return type is
  defined locally (replacing the geo-agent `MapLayerConfig` import). This
  replaces geo-agent's `DatasetCatalog.processCollection()` for our use
  case. For PMTiles: constructs `pmtiles://` URL, picks layer type from
  asset metadata or defaults to `fill`. For COG: constructs TiTiler tiles
  URL.

### GeoAgentApp.tsx — minor changes

- MCP connection moves to top of the component lifecycle (it's required, not
  optional).
- `mcpClient` is passed to `CatalogBrowser` as a required prop.
- The `onDatasetAdded` callback still increments `layerRefreshKey` and sets
  `pendingLayerSelection` — no change to the wiring.

---

## 3. Collection list via STAC root

The STAC catalog root URL (e.g.
`https://data.source.coop/cboettig/stac/catalog.json`) returns standard
STAC JSON with `rel=child` links:

```json
{
  "links": [
    { "rel": "child", "href": "./collection-id/collection.json", "title": "Collection Title" },
    ...
  ]
}
```

`fetchCollectionList()` fetches this URL, filters for `rel=child` links,
extracts the collection ID from the href (last path segment before
`collection.json`) and the title from the link's `title` field. This is
plain STAC — no MCP tool, no markdown parsing. The `browse_stac_catalog`
MCP tool exists for LLM consumption (markdown); the UI reads the structured
JSON directly.

---

## 4. Add-to-Map flow

**Before:** One "Add" button per collection → adds *all* visual assets at once
via `DatasetCatalog.processCollection()`.

**After:** One "Add to Map" button per visual asset:

1. User clicks "Add to Map" on a specific asset.
2. `assetToMapLayerConfig()` builds the config from the `get_collection` JSON.
3. `mapController.addLayer(collectionId, config, columns)` adds it — same
   interface as today.
4. Layer ID format stays `{collectionId}/{assetId}`.
5. `onDatasetAdded` fires → parent updates `layerRefreshKey` and
   `pendingLayerSelection`.

Non-visual assets (GeoParquet, other) are shown in the asset list but have no
"Add to Map" button — they're informational.

---

## 5. What gets removed

- **`src/core/stac.ts`** — Deleted entirely. All STAC fetching moves to MCP.
- **geo-agent type imports in `types.ts`** — The re-exports of `DatasetEntry`,
  `MapLayerConfig`, `ParquetAsset`, `ColumnInfo`, and `ToolResult` from
  `geo-agent/app/dataset-catalog.js` and `geo-agent/app/tool-registry.js` are
  removed. We define equivalent types locally where needed (most already exist
  in `LayerState`).
- **geo-agent `DatasetCatalog` usage** — `stac.ts` calls
  `DatasetCatalog.processCollection()`. That call is replaced by
  `assetToMapLayerConfig()` in `mcp-catalog.ts`.

After this, the only geo-agent dependency that may remain is the
`geo-agent` npm package entry in `package.json`. If no runtime imports
survive, it gets removed from dependencies entirely.

---

## 6. Export compatibility

Three existing exports survive unchanged; one new export is added:

### layers-input.json (unchanged)

`exportLayersInput()` groups `LayerState` entries by `datasetId`, emits
`{ collection_id, assets: [{ id, visible }] }`. This already matches
geo-agent's `layers-input.json` format exactly. The `LayersInputConfig` type
in `types.ts` is already locally defined — no geo-agent import needed.

### Static HTML export (unchanged)

Self-contained MapLibre page with inline sources, layers, and paint. Serializes
directly from the live map. No geo-agent dependency.

### Tool call log (unchanged)

Pure recorder output.

### Standalone app export (new)

A fourth export button: **"Export Standalone App"** downloads a zip containing:

- `layers-input.json` — same as the existing export
- `index.html` — a minimal HTML page that fetches `layers-input.json` and
  bootstraps a MapLibre map with PMTiles protocol support

This gives users a self-contained geo-agent-compatible app they can deploy
or share. The HTML template is similar to the static HTML export but reads
configuration from the JSON file instead of inlining it, making it a proper
geo-agent template app.

---

## 7. What stays unchanged

- **MapViewController** (`MapView.tsx`) — Already accepts the right config
  shape. All layer mutation methods take explicit `layerId`. No geo-agent
  dependency.
- **LayerPanel / LayerDetails / tool forms** (`SetStyleForm`,
  `SetFilterForm`, `FilterByQueryForm`) — Operate on `LayerState` objects.
  Don't care how the layer was added.
- **Tool call recorder** (`core/tools.ts`) — Pure recording, no STAC
  dependency.
- **MCP client class** (`core/mcp.ts`) — Already has `callTool()`. Becomes
  required for catalog browser but the class itself doesn't change.

---

## External issues

- **data-workflows#115** — STAC catalog structure issue (Global Wetlands Data
  has no child links, only multiple assets directly on the collection).
