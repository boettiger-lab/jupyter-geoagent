# Layer Configuration UI (Tier 1 + 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose geo-agent's per-layer configuration (opacity, fill color, filters, colormap, rescale, asset versions) through a detail pane at the bottom of the right-hand Layer panel.

**Architecture:** Add a `selectedLayerId` state to `LayerPanel`; when a row is clicked, render a new `LayerDetails` component below the list. `LayerDetails` reads the (now richer) `LayerState` and calls new imperative methods on `MapViewController` (`setOpacity`, `setFillColor`, `setColormap`, `setRescale`, `switchVersion`, plus a reused `setFilter`). Every control change also goes through `ToolCallRecorder.record()` so reruns are reproducible. `MapViewController.addLayer` is extended to copy the config fields geo-agent already extracted (`columns`, `colormap`, `rescale`, `defaultStyle`, `versions`, `defaultVersionIndex`, `assetId`) onto `LayerState`, so the detail pane can populate controls without re-reading the STAC source.

**Tech Stack:** TypeScript 5 / React 18 / MapLibre GL JS 4 / TiTiler / JupyterLab 4 federated extension; geo-agent's `DatasetCatalog` already computes the STAC-derived fields.

**Spec:** boettiger-lab/jupyter-geoagent#3

**Test strategy:** This repo has no jest/playwright harness. Each task ends with a **browser verification** step (rebuild extension, reload the running Lab server at `http://localhost:8888`, exercise the new control, confirm the expected visual/behavioral result) and a commit. The Lab dev server is expected to be running via `jlpm watch` + `jupyter lab --no-browser` from the repo root; if not, start them first.

---

## File Structure

**Modify:**
- `src/core/types.ts` — extend `LayerState` with the config fields surfaced by the detail pane
- `src/components/MapView.tsx` — populate the new `LayerState` fields in `addLayer`; add imperative methods (`setOpacity`, `setFillColor`, `setColormap`, `setRescale`, `switchVersion`)
- `src/components/LayerPanel.tsx` — add selection state, highlight the selected row, render `<LayerDetails>` below the list
- `style/base.css` — styles for the selected row and the detail pane

**Create:**
- `src/components/LayerDetails.tsx` — the bottom-of-panel detail pane with opacity slider, color picker, filter display, categorical filter builder, colormap dropdown, rescale inputs, version dropdown

---

## Task 1: Extend `LayerState` with config fields

Add the fields the detail pane needs: asset id, configured colormap/rescale/default style, and the full list of versioned assets.

**Files:**
- Modify: `src/core/types.ts:55-67`

- [ ] **Step 1: Edit `LayerState`**

Replace the existing `LayerState` block in `src/core/types.ts`:

```ts
export interface LayerState {
  id: string;
  datasetId: string;
  assetId: string;
  displayName: string;
  type: 'vector' | 'raster';
  visible: boolean;
  opacity: number;
  fillColor?: string;
  filter?: any[];
  defaultFilter?: any[];
  paint?: Record<string, any>;
  colormap?: string;
  rescale?: string;
  sourceId: string;
  sourceLayer?: string;
  columns: ColumnInfo[];
  versions?: Array<{
    label: string;
    assetId: string;
    layerType: string;
    url?: string;
    cogUrl?: string;
    sourceLayer?: string;
    sourceType?: string;
  }>;
  currentVersionIndex?: number;
  /** TiTiler base URL captured at layer creation, so raster retile calls don't need to thread it through. */
  titilerUrl?: string;
  /** The original COG url (raster only), kept so we can rebuild the tiles URL on colormap/rescale change. */
  cogUrl?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/types.ts
git commit -m "types: extend LayerState with config fields for detail pane"
```

---

## Task 2: Populate new `LayerState` fields in `MapViewController.addLayer`

The `MapLayerConfig` coming out of geo-agent already carries columns, versions, colormap, rescale, and `defaultStyle`. Wire them onto `LayerState` so the detail pane can read them.

**Files:**
- Modify: `src/components/MapView.tsx:55-141`

- [ ] **Step 1: Import `DatasetCatalog` column lookup**

At the top of `src/components/MapView.tsx`, add the `ColumnInfo` import alongside the existing type imports:

```ts
import { MapLayerConfig, LayerState, MapViewState } from '../core/types';
import type { ColumnInfo } from 'geo-agent/app/dataset-catalog.js';
```

- [ ] **Step 2: Accept an optional `columns` argument on `addLayer`**

Change the `addLayer` signature and pass `columns` through to the tracked `LayerState`. Replace the existing `addLayer(datasetId, config)` method with:

```ts
addLayer(datasetId: string, config: MapLayerConfig, columns: ColumnInfo[] = []): string {
  const layerId = `${datasetId}/${config.assetId}`;
  const sourceId = `src-${layerId.replace(/[^a-zA-Z0-9]/g, '-')}`;

  if (this.map.getSource(sourceId)) {
    return layerId;
  }

  if (config.layerType === 'vector') {
    if (config.sourceType === 'geojson') {
      this.map.addSource(sourceId, { type: 'geojson', data: config.url! });
    } else {
      this.map.addSource(sourceId, {
        type: 'vector',
        url: `pmtiles://${config.url}`,
      });
    }

    const paint = config.defaultStyle || {
      'fill-color': '#2E7D32',
      'fill-opacity': 0.5,
    };

    const layerDef: maplibregl.LayerSpecification = {
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: paint as any,
      layout: { visibility: config.defaultVisible ? 'visible' : 'none' },
    };

    if (config.sourceLayer && config.sourceType !== 'geojson') {
      (layerDef as any)['source-layer'] = config.sourceLayer;
    }

    this.map.addLayer(layerDef);

    const outlineId = `${layerId}-outline`;
    const outlineDef: maplibregl.LayerSpecification = {
      id: outlineId,
      type: 'line',
      source: sourceId,
      paint: { 'line-color': '#333', 'line-width': 0.5, 'line-opacity': 0.5 },
      layout: { visibility: config.defaultVisible ? 'visible' : 'none' },
    };
    if (config.sourceLayer && config.sourceType !== 'geojson') {
      (outlineDef as any)['source-layer'] = config.sourceLayer;
    }
    this.map.addLayer(outlineDef);

  } else if (config.layerType === 'raster') {
    let tilesUrl = `${this.titilerUrl}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=${encodeURIComponent(config.cogUrl!)}`;
    tilesUrl += `&colormap_name=${config.colormap || 'reds'}`;
    if (config.rescale) tilesUrl += `&rescale=${config.rescale}`;

    this.map.addSource(sourceId, {
      type: 'raster',
      tiles: [tilesUrl],
      tileSize: 256,
    });

    this.map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: { 'raster-opacity': 0.7 },
      layout: { visibility: config.defaultVisible ? 'visible' : 'none' },
    });
  }

  const initialOpacity = config.layerType === 'raster' ? 0.7 : 0.5;
  const initialFillColor = config.layerType === 'vector'
    ? (config.defaultStyle?.['fill-color'] as string | undefined) || '#2E7D32'
    : undefined;

  this.layers.set(layerId, {
    id: layerId,
    datasetId,
    assetId: config.assetId,
    displayName: config.title,
    type: config.layerType,
    visible: config.defaultVisible,
    opacity: initialOpacity,
    fillColor: initialFillColor,
    filter: config.defaultFilter,
    defaultFilter: config.defaultFilter,
    paint: config.defaultStyle,
    colormap: config.colormap,
    rescale: config.rescale ?? undefined,
    sourceId,
    sourceLayer: config.sourceLayer,
    columns,
    versions: config.versions,
    currentVersionIndex: config.defaultVersionIndex,
    titilerUrl: this.titilerUrl,
    cogUrl: config.cogUrl,
  });

  return layerId;
}
```

- [ ] **Step 3: Update the `addLayer` caller in `CatalogBrowser`**

In `src/components/CatalogBrowser.tsx`, in `addCollection` (around line 94), forward the dataset's columns to the controller. Replace:

```tsx
for (const layer of dataset.mapLayers) {
  const layerId = mapController.addLayer(dataset.id, layer);
  mapController.showLayer(layerId);
  recorder.record('show_layer', { layer_id: layerId });
}
```

with:

```tsx
for (const layer of dataset.mapLayers) {
  const layerId = mapController.addLayer(dataset.id, layer, dataset.columns);
  mapController.showLayer(layerId);
  recorder.record('show_layer', { layer_id: layerId });
}
```

- [ ] **Step 4: Rebuild and verify**

Run (from repo root):

```bash
jlpm build
```

Expected: no TypeScript errors. Refresh the browser, open the GeoAgent panel, add a CPAD layer and a raster layer, then in devtools console:

```js
// Grab controller via the active panel's React ref chain, or by reading map.layers.
// Quickest check: inspect any LayerState via the map controller once it's on window:
```

Temporarily add `(window as any).__geo = controller;` inside `handleMapReady` in `src/components/GeoAgentApp.tsx:63-70` for this verification; then in console run:

```js
[...window.__geo.layers.values()].map(l => ({ id: l.id, type: l.type, colormap: l.colormap, versions: l.versions?.length, cols: l.columns.length }))
```

Expected: each entry shows populated `colormap` (for raster), populated `columns` array (for vector layers with `table:columns`), and `versions` count when the asset is versioned.

Remove the temporary `window.__geo` line before committing.

- [ ] **Step 5: Commit**

```bash
git add src/components/MapView.tsx src/components/CatalogBrowser.tsx
git commit -m "MapView: populate LayerState config fields from MapLayerConfig"
```

---

## Task 3: Add imperative config methods to `MapViewController`

These are the methods the detail pane will call. All mutate the map and the tracked `LayerState`.

**Files:**
- Modify: `src/components/MapView.tsx` (add methods after `clearFilter`, around line 200)

- [ ] **Step 1: Add `setOpacity`**

Insert after the existing `clearFilter` method:

```ts
setOpacity(layerId: string, opacity: number): boolean {
  const state = this.layers.get(layerId);
  if (!state || !this.map.getLayer(layerId)) return false;

  if (state.type === 'vector') {
    this.map.setPaintProperty(layerId, 'fill-opacity', opacity);
    if (this.map.getLayer(`${layerId}-outline`)) {
      this.map.setPaintProperty(`${layerId}-outline`, 'line-opacity', opacity);
    }
  } else if (state.type === 'raster') {
    this.map.setPaintProperty(layerId, 'raster-opacity', opacity);
  }
  state.opacity = opacity;
  return true;
}
```

- [ ] **Step 2: Add `setFillColor`**

```ts
setFillColor(layerId: string, color: string): boolean {
  const state = this.layers.get(layerId);
  if (!state || state.type !== 'vector' || !this.map.getLayer(layerId)) return false;
  this.map.setPaintProperty(layerId, 'fill-color', color);
  state.fillColor = color;
  return true;
}
```

- [ ] **Step 3: Add `setColormap` and `setRescale` (raster retile helper)**

Both regenerate the raster source tile URL. Factor a private helper:

```ts
private _retileRaster(layerId: string): boolean {
  const state = this.layers.get(layerId);
  if (!state || state.type !== 'raster' || !state.cogUrl || !state.titilerUrl) return false;

  let tilesUrl = `${state.titilerUrl}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=${encodeURIComponent(state.cogUrl)}`;
  tilesUrl += `&colormap_name=${state.colormap || 'reds'}`;
  if (state.rescale) tilesUrl += `&rescale=${state.rescale}`;

  // MapLibre: setTiles swaps URL and invalidates cached tiles.
  const source = this.map.getSource(state.sourceId) as maplibregl.RasterTileSource | undefined;
  if (!source || typeof (source as any).setTiles !== 'function') return false;
  (source as any).setTiles([tilesUrl]);
  return true;
}

setColormap(layerId: string, colormap: string): boolean {
  const state = this.layers.get(layerId);
  if (!state || state.type !== 'raster') return false;
  state.colormap = colormap;
  return this._retileRaster(layerId);
}

setRescale(layerId: string, rescale: string | undefined): boolean {
  const state = this.layers.get(layerId);
  if (!state || state.type !== 'raster') return false;
  state.rescale = rescale;
  return this._retileRaster(layerId);
}
```

- [ ] **Step 4: Add `switchVersion`**

Swap the underlying source URL without tearing down the MapLibre layer entry, so list position and visibility are preserved.

```ts
switchVersion(layerId: string, versionIndex: number): boolean {
  const state = this.layers.get(layerId);
  if (!state || !state.versions || versionIndex < 0 || versionIndex >= state.versions.length) return false;
  const v = state.versions[versionIndex];

  if (state.type === 'vector') {
    const source = this.map.getSource(state.sourceId) as any;
    if (!source) return false;
    // MapLibre vector sources expose setUrl for PMTiles / tilejson style.
    if (v.sourceType === 'geojson' && v.url) {
      if (typeof source.setData === 'function') source.setData(v.url);
      else return false;
    } else if (v.url) {
      if (typeof source.setUrl === 'function') source.setUrl(`pmtiles://${v.url}`);
      else return false;
    }
    if (v.sourceLayer && v.sourceLayer !== state.sourceLayer) {
      // source-layer is per-layer, not per-source — update both the fill and outline layers.
      (this.map as any).getLayer(layerId) && (this.map as any).setLayerZoomRange && null;
      // MapLibre has no public setSourceLayer; remove & re-add both layers to swap source-layer.
      const fill = (this.map as any).getLayer(layerId);
      const outline = (this.map as any).getLayer(`${layerId}-outline`);
      if (fill) this.map.removeLayer(layerId);
      if (outline) this.map.removeLayer(`${layerId}-outline`);

      const fillPaint = state.fillColor
        ? { 'fill-color': state.fillColor, 'fill-opacity': state.opacity }
        : { 'fill-color': '#2E7D32', 'fill-opacity': state.opacity };
      this.map.addLayer({
        id: layerId,
        type: 'fill',
        source: state.sourceId,
        'source-layer': v.sourceLayer,
        paint: fillPaint as any,
        layout: { visibility: state.visible ? 'visible' : 'none' },
      } as any);
      this.map.addLayer({
        id: `${layerId}-outline`,
        type: 'line',
        source: state.sourceId,
        'source-layer': v.sourceLayer,
        paint: { 'line-color': '#333', 'line-width': 0.5, 'line-opacity': state.opacity },
        layout: { visibility: state.visible ? 'visible' : 'none' },
      } as any);
      if (state.filter) {
        this.map.setFilter(layerId, state.filter as any);
        this.map.setFilter(`${layerId}-outline`, state.filter as any);
      }
      state.sourceLayer = v.sourceLayer;
    }
  } else if (state.type === 'raster' && v.cogUrl) {
    state.cogUrl = v.cogUrl;
    this._retileRaster(layerId);
  } else {
    return false;
  }

  state.currentVersionIndex = versionIndex;
  return true;
}
```

- [ ] **Step 5: Rebuild and verify**

```bash
jlpm build
```

Expected: no TypeScript errors. Refresh the Lab tab, open a panel, add any layer, and in devtools (with the temporary `window.__geo` line re-added) exercise each method:

```js
const id = [...window.__geo.layers.keys()][0];
window.__geo.setOpacity(id, 0.2);     // layer becomes nearly transparent
window.__geo.setOpacity(id, 1.0);     // fully opaque
// For a vector layer:
window.__geo.setFillColor(id, '#ff0088');   // fill turns magenta
// For a raster layer (use its id):
window.__geo.setColormap(rid, 'viridis');    // tiles re-render with viridis
window.__geo.setRescale(rid, '0,100');       // tiles re-render with new stretch
```

Each call should return `true` and you should see the visual change on the map. Remove the temporary `window.__geo` assignment before committing.

- [ ] **Step 6: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "MapView: add setOpacity/setFillColor/setColormap/setRescale/switchVersion"
```

---

## Task 4: LayerPanel selection state + selected-row styling

Before building the detail pane, make rows selectable.

**Files:**
- Modify: `src/components/LayerPanel.tsx`
- Modify: `style/base.css` (append selection styles)

- [ ] **Step 1: Add selection state and click handler to `LayerPanel`**

Replace the entire body of `src/components/LayerPanel.tsx` with:

```tsx
/**
 * LayerPanel — shows active map layers with visibility, opacity, and remove controls.
 *
 * Clicking a row selects it; the selected layer's details render in the
 * LayerDetails pane at the bottom.
 */

import * as React from 'react';
import { MapViewController } from './MapView';
import { LayerState } from '../core/types';
import { ToolCallRecorder } from '../core/tools';
import { LayerDetails } from './LayerDetails';

export interface LayerPanelProps {
  mapController: MapViewController | null;
  recorder: ToolCallRecorder;
  /** Increment this to force re-render when layers change externally */
  refreshKey: number;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  mapController,
  recorder,
  refreshKey,
}) => {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const layers = React.useMemo(() => {
    if (!mapController) return [];
    return [...mapController.layers.values()].reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapController, refreshKey]);

  // Drop the selection if the selected layer has been removed.
  React.useEffect(() => {
    if (selectedId && !layers.find(l => l.id === selectedId)) {
      setSelectedId(null);
    }
  }, [layers, selectedId]);

  const toggleVisibility = React.useCallback((layer: LayerState) => {
    if (!mapController) return;
    if (layer.visible) {
      mapController.hideLayer(layer.id);
      recorder.record('hide_layer', { layer_id: layer.id });
    } else {
      mapController.showLayer(layer.id);
      recorder.record('show_layer', { layer_id: layer.id });
    }
    forceUpdate();
  }, [mapController, recorder]);

  const removeLayer = React.useCallback((layer: LayerState) => {
    if (!mapController) return;
    mapController.removeLayer(layer.id);
    recorder.record('hide_layer', { layer_id: layer.id });
    if (selectedId === layer.id) setSelectedId(null);
    forceUpdate();
  }, [mapController, recorder, selectedId]);

  const selectedLayer = selectedId ? layers.find(l => l.id === selectedId) ?? null : null;

  if (layers.length === 0) {
    return (
      <div className="jp-GeoAgent-layers">
        <h3>Layers</h3>
        <p className="jp-GeoAgent-empty">No layers added yet. Browse the STAC catalog to add data.</p>
      </div>
    );
  }

  return (
    <div className="jp-GeoAgent-layers">
      <h3>Layers</h3>
      <ul className="jp-GeoAgent-layer-list">
        {layers.map(layer => (
          <li
            key={layer.id}
            className={
              'jp-GeoAgent-layer-item' +
              (layer.id === selectedId ? ' jp-GeoAgent-layer-item-selected' : '')
            }
            onClick={() => setSelectedId(layer.id)}
          >
            <div className="jp-GeoAgent-layer-header">
              <label
                className="jp-GeoAgent-layer-toggle"
                onClick={e => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() => toggleVisibility(layer)}
                />
                <span>{layer.displayName}</span>
              </label>
              <button
                onClick={e => { e.stopPropagation(); removeLayer(layer); }}
                className="jp-GeoAgent-button-icon"
                title="Remove layer"
              >
                x
              </button>
            </div>
            <div className="jp-GeoAgent-layer-meta">
              <span className="jp-GeoAgent-layer-type">{layer.type}</span>
              <span className="jp-GeoAgent-layer-id">{layer.id}</span>
            </div>
          </li>
        ))}
      </ul>

      {selectedLayer && (
        <LayerDetails
          layer={selectedLayer}
          mapController={mapController}
          recorder={recorder}
          onChange={forceUpdate}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Create a stub `LayerDetails` so the import compiles**

Create `src/components/LayerDetails.tsx`:

```tsx
/**
 * LayerDetails — detail pane rendered at the bottom of the LayerPanel
 * when a layer is selected. Exposes per-layer config: opacity, fill color,
 * default_filter display, categorical filter builder, colormap / rescale,
 * and version switcher.
 *
 * Tiers 1 and 2 from boettiger-lab/jupyter-geoagent#3.
 */

import * as React from 'react';
import { LayerState } from '../core/types';
import { MapViewController } from './MapView';
import { ToolCallRecorder } from '../core/tools';

export interface LayerDetailsProps {
  layer: LayerState;
  mapController: MapViewController | null;
  recorder: ToolCallRecorder;
  /** Fired after any control change so the parent can re-read layer state. */
  onChange: () => void;
}

export const LayerDetails: React.FC<LayerDetailsProps> = ({ layer }) => {
  return (
    <div className="jp-GeoAgent-layer-details">
      <h4>Layer Details</h4>
      <div className="jp-GeoAgent-layer-details-name">{layer.displayName}</div>
    </div>
  );
};
```

- [ ] **Step 3: Add selection + detail pane styles**

Append to `style/base.css`:

```css
/* ── Layer selection & detail pane ── */

.jp-GeoAgent-layer-item {
  cursor: pointer;
}

.jp-GeoAgent-layer-item:hover {
  background: var(--jp-layout-color2);
}

.jp-GeoAgent-layer-item-selected {
  background: var(--jp-layout-color2);
  border-left: 3px solid var(--jp-brand-color1);
  padding-left: 5px;
}

.jp-GeoAgent-layer-details {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--jp-border-color1);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jp-GeoAgent-layer-details h4 {
  margin: 0;
  font-size: var(--jp-ui-font-size1);
  color: var(--jp-ui-font-color0);
}

.jp-GeoAgent-layer-details-name {
  font-size: var(--jp-ui-font-size0);
  color: var(--jp-ui-font-color2);
}

.jp-GeoAgent-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.jp-GeoAgent-field-label {
  font-size: var(--jp-ui-font-size0);
  color: var(--jp-ui-font-color2);
  display: flex;
  justify-content: space-between;
}

.jp-GeoAgent-field-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.jp-GeoAgent-field-row input[type="number"] {
  width: 80px;
}

.jp-GeoAgent-filter-readonly {
  font-family: var(--jp-code-font-family);
  font-size: var(--jp-code-font-size);
  background: var(--jp-layout-color0);
  border: 1px solid var(--jp-border-color2);
  border-radius: 3px;
  padding: 4px 6px;
  white-space: pre-wrap;
  word-break: break-all;
}
```

- [ ] **Step 4: Rebuild and verify**

```bash
jlpm build
```

Expected: no TypeScript errors. In the browser, add ≥2 layers, click different rows. The clicked row gets a left accent border + lighter background, and a minimal "Layer Details — <name>" pane appears below the list. Clicking the checkbox or the remove button must NOT change selection.

- [ ] **Step 5: Commit**

```bash
git add src/components/LayerPanel.tsx src/components/LayerDetails.tsx style/base.css
git commit -m "LayerPanel: add selection state + LayerDetails stub"
```

---

## Task 5: Tier 1 — Opacity slider + `default_filter` read-only display (universal)

**Files:**
- Modify: `src/components/LayerDetails.tsx`

- [ ] **Step 1: Render the opacity slider and default_filter block**

Replace the component body in `src/components/LayerDetails.tsx` with:

```tsx
export const LayerDetails: React.FC<LayerDetailsProps> = ({
  layer,
  mapController,
  recorder,
  onChange,
}) => {
  const handleOpacity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!mapController) return;
    mapController.setOpacity(layer.id, v);
    recorder.record('set_opacity', { layer_id: layer.id, opacity: v });
    onChange();
  };

  return (
    <div className="jp-GeoAgent-layer-details">
      <h4>Layer Details</h4>
      <div className="jp-GeoAgent-layer-details-name">{layer.displayName}</div>

      <div className="jp-GeoAgent-field">
        <div className="jp-GeoAgent-field-label">
          <span>Opacity</span>
          <span>{layer.opacity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={layer.opacity}
          onChange={handleOpacity}
        />
      </div>

      {layer.defaultFilter && (
        <div className="jp-GeoAgent-field">
          <div className="jp-GeoAgent-field-label">
            <span>Default filter</span>
          </div>
          <div className="jp-GeoAgent-filter-readonly">
            {JSON.stringify(layer.defaultFilter)}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Rebuild and verify**

```bash
jlpm build
```

Expected: no errors. In the browser, add a vector layer and a raster layer. Select each, drag the opacity slider — the map layer fades continuously in both cases. The numeric readout on the right of the label updates live. For a vector layer that has a `defaultFilter`, the raw JSON filter is shown in a monospace box.

- [ ] **Step 3: Commit**

```bash
git add src/components/LayerDetails.tsx
git commit -m "LayerDetails: opacity slider + default_filter display (Tier 1)"
```

---

## Task 6: Tier 1 — Fill color picker (vector polygons)

**Files:**
- Modify: `src/components/LayerDetails.tsx`

- [ ] **Step 1: Add a vector-only color input**

In `src/components/LayerDetails.tsx`, add a `handleFillColor` handler and a conditional color field. Place the color block directly after the Opacity block:

```tsx
  const handleFillColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const c = e.target.value;
    if (!mapController) return;
    mapController.setFillColor(layer.id, c);
    recorder.record('set_fill_color', { layer_id: layer.id, color: c });
    onChange();
  };
```

And directly after the Opacity `<div>`, insert:

```tsx
      {layer.type === 'vector' && (
        <div className="jp-GeoAgent-field">
          <div className="jp-GeoAgent-field-label">
            <span>Fill color</span>
            <span>{layer.fillColor ?? '—'}</span>
          </div>
          <input
            type="color"
            value={layer.fillColor ?? '#2E7D32'}
            onChange={handleFillColor}
          />
        </div>
      )}
```

- [ ] **Step 2: Rebuild and verify**

```bash
jlpm build
```

Expected: no errors. In the browser, add a vector polygon layer (e.g. a CPAD or watersheds layer). Select it; the fill color input shows the current color. Pick a different color — the map fill updates immediately. Select a raster layer: no color input is rendered.

- [ ] **Step 3: Commit**

```bash
git add src/components/LayerDetails.tsx
git commit -m "LayerDetails: fill color picker for vector layers (Tier 1)"
```

---

## Task 7: Tier 2 vector — Categorical filter builder

Uses `layer.columns` (the STAC `table:columns` schema already surfaced by geo-agent) to offer a column dropdown and, when the column has enumerated `values`, a multi-select. The builder emits a MapLibre `match` expression and calls `MapViewController.setFilter`.

**Files:**
- Modify: `src/components/LayerDetails.tsx`

- [ ] **Step 1: Add local builder state + helpers**

At the top of the `LayerDetails` component body (before `handleOpacity`), add:

```tsx
  const [filterColumn, setFilterColumn] = React.useState<string>('');
  const [filterValues, setFilterValues] = React.useState<string[]>([]);

  // Reset the builder when the selected layer changes.
  React.useEffect(() => {
    setFilterColumn('');
    setFilterValues([]);
  }, [layer.id]);

  const columnsWithValues = React.useMemo(
    () => layer.columns.filter(c => c.values && c.values.length > 0),
    [layer.columns]
  );

  const activeColumn = columnsWithValues.find(c => c.name === filterColumn);

  const applyCategoricalFilter = () => {
    if (!mapController) return;
    if (!filterColumn || filterValues.length === 0) {
      mapController.clearFilter(layer.id);
      recorder.record('clear_filter', { layer_id: layer.id });
    } else {
      // MapLibre `match` expression: ["match", ["get", col], [v1, v2, ...], true, false]
      const expr: any[] = ['match', ['get', filterColumn], filterValues, true, false];
      mapController.setFilter(layer.id, expr);
      recorder.record('set_filter', { layer_id: layer.id, filter: expr });
    }
    onChange();
  };

  const toggleValue = (v: string) => {
    setFilterValues(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
    );
  };
```

- [ ] **Step 2: Render the builder block (vector only, with at least one column)**

Insert after the Fill color block and before the `defaultFilter` display:

```tsx
      {layer.type === 'vector' && columnsWithValues.length > 0 && (
        <div className="jp-GeoAgent-field">
          <div className="jp-GeoAgent-field-label">
            <span>Filter by column</span>
            {layer.filter && (
              <button
                className="jp-GeoAgent-button jp-GeoAgent-button-small"
                onClick={() => {
                  if (!mapController) return;
                  mapController.clearFilter(layer.id);
                  recorder.record('clear_filter', { layer_id: layer.id });
                  setFilterColumn('');
                  setFilterValues([]);
                  onChange();
                }}
              >
                Clear
              </button>
            )}
          </div>
          <select
            className="jp-GeoAgent-input"
            value={filterColumn}
            onChange={e => { setFilterColumn(e.target.value); setFilterValues([]); }}
          >
            <option value="">— column —</option>
            {columnsWithValues.map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          {activeColumn && (
            <>
              <div
                style={{
                  maxHeight: 140,
                  overflowY: 'auto',
                  border: '1px solid var(--jp-border-color2)',
                  borderRadius: 3,
                  padding: '4px 6px',
                }}
              >
                {activeColumn.values!.map(v => (
                  <label
                    key={v}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--jp-ui-font-size0)' }}
                  >
                    <input
                      type="checkbox"
                      checked={filterValues.includes(v)}
                      onChange={() => toggleValue(v)}
                    />
                    <span>{v}</span>
                  </label>
                ))}
              </div>
              <button
                className="jp-GeoAgent-button jp-GeoAgent-button-small"
                disabled={filterValues.length === 0}
                onClick={applyCategoricalFilter}
              >
                Apply filter ({filterValues.length})
              </button>
            </>
          )}
        </div>
      )}
```

- [ ] **Step 3: Rebuild and verify**

```bash
jlpm build
```

Expected: no errors. In the browser, add a vector layer whose STAC collection publishes `table:columns` with enumerated values (CPAD's `access_typ` is a standard example — check the Catalog Browser in the Nautilus catalog). Select it; the "Filter by column" dropdown lists columns that have values; pick one; checkboxes for its values appear; select 2–3 values and click "Apply filter (N)". Only matching features remain visible on the map. "Clear" restores all features. For a vector layer without `table:columns`, the filter builder is not rendered.

- [ ] **Step 4: Commit**

```bash
git add src/components/LayerDetails.tsx
git commit -m "LayerDetails: categorical filter builder from STAC table:columns (Tier 2)"
```

---

## Task 8: Tier 2 raster — Colormap dropdown + rescale inputs

**Files:**
- Modify: `src/components/LayerDetails.tsx`

- [ ] **Step 1: Add rescale state + handlers**

Add at the top of the component body (after the categorical filter state):

```tsx
  // Rescale is a "min,max" string on LayerState; split for the two inputs.
  const [rescaleMin, rescaleMax] = React.useMemo(() => {
    if (!layer.rescale) return ['', ''];
    const [a, b] = layer.rescale.split(',');
    return [a ?? '', b ?? ''];
  }, [layer.rescale]);

  const [minInput, setMinInput] = React.useState(rescaleMin);
  const [maxInput, setMaxInput] = React.useState(rescaleMax);

  React.useEffect(() => {
    setMinInput(rescaleMin);
    setMaxInput(rescaleMax);
  }, [rescaleMin, rescaleMax, layer.id]);

  const applyRescale = () => {
    if (!mapController) return;
    const trimmedMin = minInput.trim();
    const trimmedMax = maxInput.trim();
    const rescale = (trimmedMin && trimmedMax) ? `${trimmedMin},${trimmedMax}` : undefined;
    mapController.setRescale(layer.id, rescale);
    recorder.record('set_rescale', { layer_id: layer.id, rescale: rescale ?? null });
    onChange();
  };

  const handleColormap = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cm = e.target.value;
    if (!mapController) return;
    mapController.setColormap(layer.id, cm);
    recorder.record('set_colormap', { layer_id: layer.id, colormap: cm });
    onChange();
  };

  const COLORMAPS = [
    'viridis', 'plasma', 'inferno', 'magma', 'cividis',
    'turbo', 'reds', 'blues', 'greens', 'greys',
    'ylgnbu', 'ylorrd', 'rdylgn', 'spectral',
  ];
```

- [ ] **Step 2: Render the raster-only block**

Insert after the categorical filter block and before the `defaultFilter` display:

```tsx
      {layer.type === 'raster' && (
        <>
          <div className="jp-GeoAgent-field">
            <div className="jp-GeoAgent-field-label">
              <span>Colormap</span>
            </div>
            <select
              className="jp-GeoAgent-input"
              value={layer.colormap ?? 'reds'}
              onChange={handleColormap}
            >
              {COLORMAPS.map(cm => (
                <option key={cm} value={cm}>{cm}</option>
              ))}
            </select>
          </div>

          <div className="jp-GeoAgent-field">
            <div className="jp-GeoAgent-field-label">
              <span>Rescale (min, max)</span>
            </div>
            <div className="jp-GeoAgent-field-row">
              <input
                type="number"
                className="jp-GeoAgent-input"
                value={minInput}
                placeholder="min"
                onChange={e => setMinInput(e.target.value)}
              />
              <input
                type="number"
                className="jp-GeoAgent-input"
                value={maxInput}
                placeholder="max"
                onChange={e => setMaxInput(e.target.value)}
              />
              <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={applyRescale}>
                Apply
              </button>
            </div>
          </div>
        </>
      )}
```

- [ ] **Step 3: Rebuild and verify**

```bash
jlpm build
```

Expected: no errors. In the browser, add a COG-based raster layer from the catalog (e.g. the Irrecoverable Carbon layer). Select it; the Colormap dropdown shows the current value (defaults to `reds` if not configured). Change to `viridis` — the raster re-renders with the new colormap. Enter different min/max values and click Apply — the stretch updates (lower values become more saturated, higher less). Select a vector layer: neither colormap nor rescale is rendered.

- [ ] **Step 4: Commit**

```bash
git add src/components/LayerDetails.tsx
git commit -m "LayerDetails: colormap dropdown + rescale inputs for raster (Tier 2)"
```

---

## Task 9: Tier 2 versioned — Version dropdown

**Files:**
- Modify: `src/components/LayerDetails.tsx`

- [ ] **Step 1: Add version switch handler and dropdown**

Add to the handlers section in `LayerDetails`:

```tsx
  const handleVersionSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    if (!mapController || isNaN(idx)) return;
    mapController.switchVersion(layer.id, idx);
    recorder.record('switch_version', {
      layer_id: layer.id,
      version_index: idx,
      version_label: layer.versions?.[idx]?.label,
    });
    onChange();
  };
```

And render the dropdown near the top of the details, right after the `Layer Details` header and name, so it's the first control:

```tsx
      {layer.versions && layer.versions.length > 1 && (
        <div className="jp-GeoAgent-field">
          <div className="jp-GeoAgent-field-label">
            <span>Version</span>
          </div>
          <select
            className="jp-GeoAgent-input"
            value={layer.currentVersionIndex ?? 0}
            onChange={handleVersionSwitch}
          >
            {layer.versions.map((v, i) => (
              <option key={v.assetId} value={i}>{v.label}</option>
            ))}
          </select>
        </div>
      )}
```

- [ ] **Step 2: Rebuild and verify**

```bash
jlpm build
```

Expected: no errors. In the browser, add a layer that publishes multiple asset `versions` (the HydroBasins example in the geo-agent docs — `hydrobasins_level_03` … `_06`). Select it; the Version dropdown lists all labels. Switch between versions — the map redraws with the new asset while the layer remains selected and its opacity / fill color stay applied. For a non-versioned layer, the dropdown is not rendered. For a layer with exactly one version, also not rendered (`length > 1`).

- [ ] **Step 3: Commit**

```bash
git add src/components/LayerDetails.tsx
git commit -m "LayerDetails: version switcher for versioned assets (Tier 2)"
```

---

## Task 10: Close-out — link the feature to the issue and update docs

- [ ] **Step 1: Visual smoke test of the full feature**

Add three layers that together exercise every control: (a) a vector polygon layer with `table:columns` and a `defaultFilter`, (b) a COG raster layer, (c) a versioned layer.

Exercise, in order: select each, adjust opacity, change vector fill color, apply and clear a categorical filter, change raster colormap and rescale, switch versions. Toggle visibility and remove layers; confirm the details pane disappears when the currently-selected layer is removed.

Open the Export tab: the exported tool log should contain entries for `set_opacity`, `set_fill_color`, `set_filter`, `clear_filter`, `set_colormap`, `set_rescale`, `switch_version`, with their arguments.

- [ ] **Step 2: Push the branch and open a PR referencing issue #3**

Assuming work was done on a branch `issue-3-layer-config-ui`:

```bash
git push -u origin issue-3-layer-config-ui
gh pr create --title "Layer configuration UI (Tier 1 + 2)" --body "$(cat <<'EOF'
Implements boettiger-lab/jupyter-geoagent#3.

## Summary
- Adds a LayerDetails pane at the bottom of the Layer panel, populated on row selection
- Tier 1: opacity slider + vector fill color picker + read-only default_filter
- Tier 2 vector: categorical filter builder from STAC table:columns
- Tier 2 raster: colormap dropdown + rescale min/max inputs
- Tier 2 versioned: version switcher that swaps the underlying source without tearing down the layer

All controls route through ToolCallRecorder so the session replays cleanly.

Closes #3.

## Test plan
- [x] Opacity slider updates vector fill-opacity and raster-opacity live
- [x] Fill color picker updates vector fill-color live
- [x] Categorical filter applies a MapLibre `match` expression; Clear restores
- [x] Colormap dropdown and rescale inputs retile the raster source
- [x] Version dropdown switches the source URL in place
- [x] Exported tool log contains all new tool names with correct arguments
EOF
)"
```

---

## Self-Review

**1. Spec coverage.**

| Issue #3 checkbox | Task |
|-------------------|------|
| Opacity slider (vector + raster) | Task 5 |
| Fill color picker (vector polygons) | Task 6 |
| Display loaded default_filter read-only | Task 5 |
| Categorical filter builder from STAC table:columns | Task 7 |
| Colormap dropdown (raster) | Task 8 |
| Rescale min/max inputs (raster) | Task 8 |
| Version dropdown (versioned assets) | Task 9 |
| Detail pane at bottom of Layer panel | Task 4 |
| Layer selection on click → details | Task 4 |
| Tool calls (`set_opacity`, `set_filter`, etc.) recorded | Tasks 5–9 |
| Controller methods: `setOpacity`, `setColormap`, `switchVersion`, etc. | Task 3 |
| `LayerState` retains columns/versions/colormap/rescale/defaultStyle | Tasks 1–2 |

All covered.

**2. Placeholder scan.** No TBD, TODO, "implement later", or "similar to Task N" strings. Every code step ships full code; every verification step names specific layers and expected visual outcomes. Commit messages are concrete.

**3. Type consistency.** Method names are consistent across tasks: `setOpacity`, `setFillColor`, `setColormap`, `setRescale`, `switchVersion`, `setFilter`, `clearFilter`. `LayerState` field names (`colormap`, `rescale`, `fillColor`, `defaultFilter`, `currentVersionIndex`, `versions`, `cogUrl`, `titilerUrl`) are used identically in types, controller, and component.

Tool-call names are consistent: `set_opacity`, `set_fill_color`, `set_filter`, `clear_filter`, `set_colormap`, `set_rescale`, `switch_version`.
