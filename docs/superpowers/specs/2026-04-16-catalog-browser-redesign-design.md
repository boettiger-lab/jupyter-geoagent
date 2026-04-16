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

The catalog browser makes two MCP calls:

1. **`browse_stac_catalog`** — returns a markdown listing of collections (the
   "collection picker"). Currently returns markdown; a structured
   `list_collections` tool is tracked in mcp-data-server#62.
2. **`get_collection(collection_id)`** — returns structured JSON with assets,
   metadata, and spatial extent for a single collection (the "asset view").

No local STAC HTTP fetching. No `STACBrowser` class. No geo-agent
`DatasetCatalog.processCollection()`. The MCP server is the single source of
truth for catalog data.

MCP is **required** for the catalog browser — it is the whole point of this
extension. If no MCP connection is available, the catalog tab shows a
connection prompt instead of an empty tree.

### Data flow

```
┌─────────────────┐      callTool()       ┌──────────────┐
│  CatalogBrowser │ ───────────────────▶   │  MCP server  │
│  (React)        │ ◀─────────────────── │  (duckdb-geo) │
└────────┬────────┘   JSON / markdown     └──────────────┘
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

- **Level 1 — Collection list.** On mount (or when MCP connects), calls
  `browse_stac_catalog`. Parses the markdown response into
  `{ id, title }` pairs. Renders a searchable/filterable list. Clicking a
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

- **`parseCollectionList(markdown: string): Array<{ id: string; title: string }>`**
  — Parses `browse_stac_catalog` markdown into structured entries. This is a
  stopgap until mcp-data-server#62 delivers a structured `list_collections`
  tool. When that lands, this function is replaced by a direct call.

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

## 3. browse_stac_catalog response handling

The MCP tool `browse_stac_catalog` returns markdown like:

```
## Source STAC Catalog

- **collection-id-1**: Collection Title 1
- **collection-id-2**: Collection Title 2
  ...
```

`parseCollectionList()` extracts `{ id, title }` pairs via simple regex on
the `**id**: title` pattern. This is fragile by design — it's a stopgap.
When mcp-data-server#62 delivers `list_collections` returning structured
JSON, we replace the parse function with a direct `callTool('list_collections')`
call and the regex goes away.

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

## External issues filed

- **data-workflows#115** — STAC catalog structure issue (Global Wetlands Data
  has no child links, only multiple assets directly on the collection).
- **mcp-data-server#62** — Request for structured `list_collections` MCP tool
  to replace markdown parsing of `browse_stac_catalog`.
