# Layer Tool-Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the LayerDetails pane as a direct mirror of geo-agent's map-tool surface — forms for `set_filter`, `set_style`, and `filter_by_query` — so the human and the LLM invoke the same operations through the same code path.

**Architecture:** Three hand-crafted React form components, each wrapping one logical geo-agent tool. Tool descriptions and schemas are imported dynamically from `geo-agent/app/map-tools.js` via a 5-line `MapManager` shim, so help text stays in sync with upstream. Forms call `MapViewController` methods; the controller gains `setStyle`, `resetStyle`, `resetFilter`, `filterByQuery`, and loses the now-redundant `setFillColor`. Pre-existing bespoke controls (opacity slider, colormap, rescale, version switcher) stay as-is since those tools don't exist upstream yet.

**Tech Stack:** React 18, TypeScript, MapLibre GL JS 4, geo-agent package (dynamic import of `createMapTools`).

**Spec:** `docs/superpowers/specs/2026-04-15-layer-tool-forms-design.md`

**Branch:** `issue-3-layer-config-ui` (continuation).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/core/types.ts` | Modify | Rename `LayerState.paint` → `defaultStyle`; add `currentStyle` |
| `src/components/MapView.tsx` | Modify | Populate `defaultStyle`+`currentStyle` in `addLayer`; add `setStyle`/`resetStyle`/`resetFilter`/`filterByQuery`; remove `setFillColor` |
| `src/components/LayerDetails.tsx` | Modify | Remove fill-color picker, categorical filter builder, default-filter display; render the three form components |
| `src/components/ExportPanel.tsx` | Modify | Update `layer.paint` reference to `layer.currentStyle ?? layer.defaultStyle` |
| `src/core/tool-metadata.ts` | Create | Helper that extracts `{name, description, inputSchema}` from `createMapTools` via a minimal `MapManager` shim |
| `src/components/tool-forms/SetFilterForm.tsx` | Create | Form for `set_filter` / `clear_filter` / `reset_filter` |
| `src/components/tool-forms/SetStyleForm.tsx` | Create | Form for `set_style` / `reset_style` |
| `src/components/tool-forms/FilterByQueryForm.tsx` | Create | Form for `filter_by_query` (MCP-gated) |
| `style/base.css` | Modify | Add `.jp-GeoAgent-info` + `.jp-GeoAgent-tool-form-*` classes |

**Note on tests.** This codebase has no unit tests. Each task ends with a browser smoke test in JupyterLab plus a `jlpm build` that must exit clean (0 errors; pre-existing 31 warnings are tolerated).

---

### Task 1: LayerState rename — `paint` → `defaultStyle`, add `currentStyle`

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/components/MapView.tsx`
- Modify: `src/components/ExportPanel.tsx`

- [ ] **Step 1: Update the `LayerState` interface**

In `src/core/types.ts`, locate the `paint?: Record<string, any>;` line and replace with two fields:

```ts
  /** Original paint from MapLayerConfig.defaultStyle — never mutated after addLayer. */
  defaultStyle?: Record<string, any>;
  /** Live paint: seeded from defaultStyle, updated by setStyle. */
  currentStyle?: Record<string, any>;
```

- [ ] **Step 2: Populate both fields in `addLayer`**

In `src/components/MapView.tsx`, locate the `this.layers.set(layerId, {` block (around line 131) and replace `paint: config.defaultStyle,` with:

```ts
      defaultStyle: config.defaultStyle,
      currentStyle: config.defaultStyle ? { ...config.defaultStyle } : undefined,
```

- [ ] **Step 3: Fix ExportPanel reference**

In `src/components/ExportPanel.tsx`, locate `paint: layer.paint || {},` (around line 124) and replace with:

```ts
          paint: layer.currentStyle ?? layer.defaultStyle ?? {},
```

- [ ] **Step 4: Build**

Run: `jlpm build`
Expected: webpack compiled, 0 errors. (~31 warnings pre-existing are fine.)

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/components/MapView.tsx src/components/ExportPanel.tsx
git commit -m "refactor(types): rename LayerState.paint to defaultStyle; add currentStyle"
```

---

### Task 2: Controller — add `setStyle`, `resetStyle`, `resetFilter`

**Files:**
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Add `setStyle`**

Insert **after** the existing `setFillColor` method (around line 238) in `MapViewController`:

```ts
  /**
   * Apply a MapLibre paint object to a layer. Spreads each key via
   * setPaintProperty so unspecified keys are left untouched. Updates
   * state.currentStyle to the merged result.
   */
  setStyle(layerId: string, style: Record<string, any>): boolean {
    const state = this.layers.get(layerId);
    if (!state || !this.map.getLayer(layerId)) return false;
    for (const [key, value] of Object.entries(style)) {
      try {
        this.map.setPaintProperty(layerId, key, value);
      } catch (err) {
        // Re-throw so caller (the form) can surface the error inline.
        throw err;
      }
    }
    state.currentStyle = { ...(state.currentStyle ?? {}), ...style };
    // Keep the derived scalar fields in sync for the bespoke controls.
    if (typeof style['fill-opacity'] === 'number') state.opacity = style['fill-opacity'];
    if (typeof style['raster-opacity'] === 'number') state.opacity = style['raster-opacity'];
    if (typeof style['fill-color'] === 'string') state.fillColor = style['fill-color'];
    return true;
  }

  /**
   * Reapply the paint object the layer was created with.
   */
  resetStyle(layerId: string): boolean {
    const state = this.layers.get(layerId);
    if (!state || !state.defaultStyle) return false;
    return this.setStyle(layerId, state.defaultStyle);
  }

  /**
   * Apply the config default filter, or clear if none.
   */
  resetFilter(layerId: string): boolean {
    const state = this.layers.get(layerId);
    if (!state) return false;
    if (state.defaultFilter) return this.setFilter(layerId, state.defaultFilter);
    return this.clearFilter(layerId);
  }
```

- [ ] **Step 2: Build**

Run: `jlpm build`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "feat(map): add setStyle/resetStyle/resetFilter controller methods"
```

---

### Task 3: Tool-metadata helper

**Files:**
- Create: `src/core/tool-metadata.ts`

- [ ] **Step 1: Write the helper**

Create `src/core/tool-metadata.ts`:

```ts
/**
 * Pull tool metadata (name, description, inputSchema) out of geo-agent's
 * createMapTools(mapManager, catalog, mcpClient) without executing the
 * tools. Needed so the human-facing forms in the LayerDetails pane can
 * show the same guidance the LLM sees, and stay in sync on `yarn upgrade`.
 *
 * We pass a minimal shim for mapManager — only getLayerIds() and
 * getVectorLayerIds() are consumed by the description templates. Catalog
 * and mcpClient stubs are fine because their real methods are only
 * called inside execute functions, which we do not invoke.
 *
 * When the shared @boettiger-lab/geo-agent-core package lands
 * (boettiger-lab/jupyter-geoagent#2), swap this import for the new path.
 */

import { createMapTools } from 'geo-agent/app/map-tools.js';
import type { MapViewController } from '../components/MapView';

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: any;
}

export function getToolMetadata(
  controller: MapViewController,
): Record<string, ToolMetadata> {
  const mapManagerShim = {
    getLayerIds: () => [...controller.layers.keys()],
    getVectorLayerIds: () =>
      [...controller.layers.entries()]
        .filter(([, s]) => s.type === 'vector')
        .map(([id]) => id),
  };
  const catalogStub = { getAll: () => [], get: () => null, getIds: () => [] };
  // Pass a truthy stub so filter_by_query metadata is included.
  const mcpClientStub = {};

  const tools = createMapTools(
    mapManagerShim as any,
    catalogStub as any,
    mcpClientStub as any,
  );

  const out: Record<string, ToolMetadata> = {};
  for (const t of tools) {
    out[t.name] = {
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    };
  }
  return out;
}
```

- [ ] **Step 2: Build**

Run: `jlpm build`
Expected: 0 errors.

- [ ] **Step 3: Browser sanity check**

Reload the JupyterLab tab. Open the GeoAgent panel. Add a vector layer. In browser devtools console:

```js
// Enter devtools manually — no automated test
// The helper is exported; no runtime verification yet (forms will consume it in later tasks).
```

Skip — no runtime invocation yet.

- [ ] **Step 4: Commit**

```bash
git add src/core/tool-metadata.ts
git commit -m "feat(core): tool-metadata helper; dynamic import of geo-agent tool defs"
```

---

### Task 4: `SetFilterForm` component

**Files:**
- Create: `src/components/tool-forms/SetFilterForm.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/tool-forms/SetFilterForm.tsx`:

```tsx
/**
 * SetFilterForm — wraps geo-agent's set_filter / clear_filter /
 * reset_filter tools. Shows the current filter read-only; pre-fills a
 * textarea with that filter so the user can edit and Apply. Help text
 * (MapLibre expression examples) is sourced live from geo-agent's tool
 * description, so corrections there propagate on `yarn upgrade`.
 */

import * as React from 'react';
import { LayerState } from '../../core/types';
import { MapViewController } from '../MapView';
import { ToolCallRecorder } from '../../core/tools';
import { getToolMetadata } from '../../core/tool-metadata';

export interface SetFilterFormProps {
  layer: LayerState;
  mapController: MapViewController;
  recorder: ToolCallRecorder;
  onChange: () => void;
}

export const SetFilterForm: React.FC<SetFilterFormProps> = ({
  layer,
  mapController,
  recorder,
  onChange,
}) => {
  const initial = layer.filter ? JSON.stringify(layer.filter) : '';
  const [text, setText] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  // Re-sync the textarea when the selected layer changes. Mid-edit state
  // is not clobbered by unrelated re-renders because the local state
  // only re-initializes on layer.id change.
  React.useEffect(() => {
    setText(layer.filter ? JSON.stringify(layer.filter) : '');
    setError(null);
  }, [layer.id]);

  const meta = React.useMemo(() => getToolMetadata(mapController), [mapController]);
  const setFilterDesc = meta['set_filter']?.description ?? '';

  const apply = () => {
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
      return;
    }
    if (!Array.isArray(parsed)) {
      setError('Filter must be a JSON array (MapLibre expression).');
      return;
    }
    try {
      mapController.setFilter(layer.id, parsed);
    } catch (e: any) {
      setError(e.message);
      return;
    }
    recorder.record('set_filter', { layer_id: layer.id, filter: parsed });
    setError(null);
    setText(JSON.stringify(parsed));
    onChange();
  };

  const clear = () => {
    mapController.clearFilter(layer.id);
    recorder.record('clear_filter', { layer_id: layer.id });
    setText('');
    setError(null);
    onChange();
  };

  const reset = () => {
    mapController.resetFilter(layer.id);
    recorder.record('reset_filter', { layer_id: layer.id });
    setText(layer.defaultFilter ? JSON.stringify(layer.defaultFilter) : '');
    setError(null);
    onChange();
  };

  const currentText = layer.filter ? JSON.stringify(layer.filter) : '(none)';

  return (
    <div className="jp-GeoAgent-field jp-GeoAgent-tool-form">
      <div className="jp-GeoAgent-field-label">
        <span>Filter</span>
      </div>
      <div className="jp-GeoAgent-tool-form-current">
        <span className="jp-GeoAgent-field-label">Current:</span>{' '}
        <code>{currentText}</code>
      </div>
      <textarea
        className="jp-GeoAgent-textarea"
        rows={3}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder='["match", ["get", "col"], ["v1","v2"], true, false]'
      />
      {error && <div className="jp-GeoAgent-error">{error}</div>}
      <div className="jp-GeoAgent-field-row">
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={apply}>Apply</button>
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={clear}>Clear</button>
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={reset}>Reset to default</button>
      </div>
      {setFilterDesc && (
        <details className="jp-GeoAgent-tool-form-help">
          <summary>Filter syntax (from geo-agent)</summary>
          <pre>{setFilterDesc}</pre>
        </details>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Build**

Run: `jlpm build`
Expected: 0 errors. (Unused-import warnings for the new file are fine — it's not wired up yet.)

- [ ] **Step 3: Commit**

```bash
git add src/components/tool-forms/SetFilterForm.tsx
git commit -m "feat(tool-forms): SetFilterForm component (set_filter/clear/reset)"
```

---

### Task 5: Integrate `SetFilterForm`; remove categorical filter builder and default-filter display

**Files:**
- Modify: `src/components/LayerDetails.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/components/LayerDetails.tsx` (after the other imports), add:

```tsx
import { SetFilterForm } from './tool-forms/SetFilterForm';
```

- [ ] **Step 2: Replace the categorical filter builder with `SetFilterForm`**

Locate the block that starts with `{layer.type === 'vector' && columnsWithValues.length > 0 && (` (around line 183) and ends after the nested `</>` for the value-checkboxes (around line 248 — the closing `)}` after the `<button>Apply filter</button>`). Replace that entire block with:

```tsx
      {layer.type === 'vector' && (
        <SetFilterForm
          layer={layer}
          mapController={mapController!}
          recorder={recorder}
          onChange={onChange}
        />
      )}
```

- [ ] **Step 3: Remove the standalone default-filter display block**

Locate the block that starts with `{layer.defaultFilter && (` (around line 294) and ends with its closing `)}`. Delete the entire block — including the surrounding `{ }`. The `SetFilterForm` now shows the same information under "Current:" and its Reset button supersedes the need for a standalone display.

- [ ] **Step 4: Remove unused locals**

Near the top of the component, delete these no-longer-used state hooks and helpers:
- `const [filterColumn, setFilterColumn] = React.useState<string>('');`
- `const [filterValues, setFilterValues] = React.useState<string[]>([]);`
- the `React.useEffect` that resets them on `[layer.id]`
- `const columnsWithValues = ...`
- `const activeColumn = ...`
- `const applyCategoricalFilter = ...`
- `const toggleValue = ...`

Leave the version-switcher, opacity, fill-color, colormap, and rescale state/handlers in place — they're still used.

- [ ] **Step 5: Build**

Run: `jlpm build`
Expected: 0 errors.

- [ ] **Step 6: Browser smoke test**

Reload JupyterLab. Add a vector layer with columns (e.g. wetlands-v2 Ramsar Sites or WDPA):
1. Verify the Filter section renders with "Current: (none)" or the existing default filter.
2. Type `["==", ["get", "IUCN_CAT"], "Ia"]` into the textarea (adjust property name for your layer).
3. Click Apply. Map should filter.
4. Click Clear. Map shows all features.
5. Click Reset to default. Original default filter (if any) is restored.
6. Expand "Filter syntax (from geo-agent)"; confirm help text shows the MapLibre expression examples.
7. The old categorical checkbox builder is gone; the old "Default filter:" JSON block at the bottom is gone.

- [ ] **Step 7: Commit**

```bash
git add src/components/LayerDetails.tsx
git commit -m "feat(layers): integrate SetFilterForm; drop categorical builder + default-filter display"
```

---

### Task 6: `SetStyleForm` component + integrate + remove `setFillColor`

**Files:**
- Create: `src/components/tool-forms/SetStyleForm.tsx`
- Modify: `src/components/LayerDetails.tsx`
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Write the `SetStyleForm` component**

Create `src/components/tool-forms/SetStyleForm.tsx`:

```tsx
/**
 * SetStyleForm — wraps geo-agent's set_style / reset_style tools.
 * Pre-fills a textarea with layer.currentStyle so the user can tweak
 * individual keys or paste a full paint object (including match /
 * interpolate / step expressions). Help text sourced from geo-agent.
 */

import * as React from 'react';
import { LayerState } from '../../core/types';
import { MapViewController } from '../MapView';
import { ToolCallRecorder } from '../../core/tools';
import { getToolMetadata } from '../../core/tool-metadata';

export interface SetStyleFormProps {
  layer: LayerState;
  mapController: MapViewController;
  recorder: ToolCallRecorder;
  onChange: () => void;
}

export const SetStyleForm: React.FC<SetStyleFormProps> = ({
  layer,
  mapController,
  recorder,
  onChange,
}) => {
  const format = (s?: Record<string, any>) =>
    s ? JSON.stringify(s, null, 2) : '';

  const [text, setText] = React.useState(format(layer.currentStyle));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setText(format(layer.currentStyle));
    setError(null);
  }, [layer.id]);

  const meta = React.useMemo(() => getToolMetadata(mapController), [mapController]);
  const setStyleDesc = meta['set_style']?.description ?? '';

  const apply = () => {
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setError('Style must be a JSON object (MapLibre paint properties).');
      return;
    }
    try {
      mapController.setStyle(layer.id, parsed);
    } catch (e: any) {
      setError(e.message);
      return;
    }
    recorder.record('set_style', { layer_id: layer.id, style: parsed });
    setError(null);
    setText(format(layer.currentStyle));
    onChange();
  };

  const reset = () => {
    mapController.resetStyle(layer.id);
    recorder.record('reset_style', { layer_id: layer.id });
    setText(format(layer.defaultStyle));
    setError(null);
    onChange();
  };

  const currentText = format(layer.currentStyle) || '(none)';

  return (
    <div className="jp-GeoAgent-field jp-GeoAgent-tool-form">
      <div className="jp-GeoAgent-field-label">
        <span>Style</span>
      </div>
      <div className="jp-GeoAgent-tool-form-current">
        <span className="jp-GeoAgent-field-label">Current:</span>
        <pre className="jp-GeoAgent-filter-readonly">{currentText}</pre>
      </div>
      <textarea
        className="jp-GeoAgent-textarea"
        rows={5}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={'{\n  "fill-color": "#2E7D32",\n  "fill-opacity": 0.5\n}'}
      />
      {error && <div className="jp-GeoAgent-error">{error}</div>}
      <div className="jp-GeoAgent-field-row">
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={apply}>Apply</button>
        <button className="jp-GeoAgent-button jp-GeoAgent-button-small" onClick={reset}>Reset to default</button>
      </div>
      {setStyleDesc && (
        <details className="jp-GeoAgent-tool-form-help">
          <summary>Style syntax (from geo-agent)</summary>
          <pre>{setStyleDesc}</pre>
        </details>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Remove `setFillColor` from `MapViewController`**

In `src/components/MapView.tsx`, delete the entire `setFillColor(layerId: string, color: string): boolean { ... }` method (around lines 232–238).

Also in `switchVersion` — find the fallback paint construction that reads `state.fillColor`:

```ts
        const fillPaint = state.fillColor
          ? { 'fill-color': state.fillColor, 'fill-opacity': state.opacity }
          : { 'fill-color': '#2E7D32', 'fill-opacity': state.opacity };
```

Replace with a version that reads from `currentStyle`:

```ts
        const fillPaint = state.currentStyle ?? { 'fill-color': '#2E7D32', 'fill-opacity': state.opacity };
```

`state.fillColor` is still populated by `setStyle` for the bespoke color readouts, but the switchVersion path now correctly preserves whatever paint (including `match` expressions) the user applied via SetStyleForm.

- [ ] **Step 3: Integrate `SetStyleForm`; remove fill-color picker block**

In `src/components/LayerDetails.tsx`, add the import near the top:

```tsx
import { SetStyleForm } from './tool-forms/SetStyleForm';
```

Locate the fill-color picker block that starts with `{layer.type === 'vector' && (` (around line 169 — the one right after the opacity field, with the `<input type="color">`). Delete that entire block.

Also remove the now-unused `handleFillColor` callback at the top of the component (it calls `mapController.setFillColor` which no longer exists).

Insert the new form **after** the closing of the opacity field and **before** the `SetFilterForm` block added in Task 5:

```tsx
      <SetStyleForm
        layer={layer}
        mapController={mapController!}
        recorder={recorder}
        onChange={onChange}
      />
```

- [ ] **Step 4: Build**

Run: `jlpm build`
Expected: 0 errors. If TypeScript reports unused `handleFillColor`, delete it.

- [ ] **Step 5: Browser smoke test**

Reload JupyterLab. Add a vector layer:
1. The Style section shows "Current:" with the layer's default paint (e.g. `{"fill-color":"#2E7D32","fill-opacity":0.5}`).
2. Edit the textarea to `{"fill-color":"#FF0000","fill-opacity":0.7}`. Apply. Layer turns red at 70% opacity.
3. Paste a match expression:
   ```json
   {"fill-color":["match",["get","IUCN_CAT"],"Ia","#26633A","II","#3E9C47","#888888"],"fill-opacity":0.6}
   ```
   (Adjust property name for your layer.) Apply. Layer recolors by category.
4. Click Reset to default. Paint reverts to the original.
5. The old single-color `<input type="color">` picker is gone.

Also verify the no-longer-existent clobbering bug: add WDPA or another layer with a match-expression default, then drag the opacity slider. Expected: opacity changes, `fill-color` match expression is preserved (visible via the Style "Current:" readout).

- [ ] **Step 6: Commit**

```bash
git add src/components/tool-forms/SetStyleForm.tsx src/components/LayerDetails.tsx src/components/MapView.tsx
git commit -m "feat(tool-forms): SetStyleForm; drop fill-color picker and setFillColor"
```

---

### Task 7: Controller — `filterByQuery`

**Files:**
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Import the MCP client type**

Near the top of `src/components/MapView.tsx`, add (if not already present):

```ts
import type { MCPClientWrapper } from '../core/mcp';
```

- [ ] **Step 2: Add the method**

Insert **after** the `resetFilter` method added in Task 2:

```ts
  /**
   * Filter a vector layer by the results of a SQL query, via MCP.
   * Ports node_modules/geo-agent/app/map-tools.js filter_by_query.execute.
   * The ID array stays on the client — never passes through the LLM.
   */
  async filterByQuery(
    layerId: string,
    sql: string,
    idProperty: string,
    mcpClient: MCPClientWrapper,
  ): Promise<
    | { success: true; idCount: number; message?: string }
    | { success: false; error: string }
  > {
    const state = this.layers.get(layerId);
    if (!state || state.type !== 'vector') {
      return { success: false, error: `Layer ${layerId} is not a vector layer.` };
    }

    const col = idProperty;
    const wrappedSql = `SELECT array_agg("${col}") FILTER (WHERE "${col}" IS NOT NULL) FROM (${sql}) _filter_subquery`;

    let rawResult: string;
    try {
      rawResult = await mcpClient.callTool('query', { sql_query: wrappedSql });
    } catch (err: any) {
      return { success: false, error: `SQL execution failed: ${err.message}` };
    }

    // DuckDB returns NULL (not []) when no rows match.
    const trimmed = rawResult.trim();
    if (!trimmed || /\bnull\b/i.test(trimmed.replace(/.*\n/, ''))) {
      return { success: true, idCount: 0, message: 'Query matched no features — filter not applied.' };
    }

    // Extract the JSON array from the MCP response (same heuristic as geo-agent).
    const match = rawResult.match(/\[[\s\S]*\]/);
    if (!match) {
      return {
        success: false,
        error: `Could not parse ID list from query result. Check that id_property ("${col}") exactly matches the column name in the SQL output. Raw: ${rawResult.substring(0, 300)}`,
      };
    }
    let ids: any[];
    try {
      ids = JSON.parse(match[0]);
    } catch {
      return {
        success: false,
        error: `Could not parse ID list from query result. Raw: ${rawResult.substring(0, 300)}`,
      };
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: true, idCount: 0, message: 'Query matched no features — filter not applied.' };
    }

    const filter: any[] = ['in', ['get', col], ['literal', ids]];
    this.setFilter(layerId, filter);
    return { success: true, idCount: ids.length };
  }
```

- [ ] **Step 3: Build**

Run: `jlpm build`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "feat(map): add filterByQuery controller method (ports geo-agent filter_by_query)"
```

---

### Task 8: `FilterByQueryForm` + integrate + CSS

**Files:**
- Create: `src/components/tool-forms/FilterByQueryForm.tsx`
- Modify: `src/components/LayerDetails.tsx`
- Modify: `style/base.css`

- [ ] **Step 1: Write the form component**

Create `src/components/tool-forms/FilterByQueryForm.tsx`:

```tsx
/**
 * FilterByQueryForm — wraps geo-agent's filter_by_query tool. Runs a
 * SQL SELECT via MCP; keeps only features whose id_property appears in
 * the result. Rendered only when an MCPClientWrapper is available.
 */

import * as React from 'react';
import { LayerState } from '../../core/types';
import { MapViewController } from '../MapView';
import { ToolCallRecorder } from '../../core/tools';
import { MCPClientWrapper } from '../../core/mcp';
import { getToolMetadata } from '../../core/tool-metadata';

export interface FilterByQueryFormProps {
  layer: LayerState;
  mapController: MapViewController;
  recorder: ToolCallRecorder;
  mcpClient: MCPClientWrapper;
  onChange: () => void;
}

export const FilterByQueryForm: React.FC<FilterByQueryFormProps> = ({
  layer,
  mapController,
  recorder,
  mcpClient,
  onChange,
}) => {
  const [sql, setSql] = React.useState('');
  const [idProperty, setIdProperty] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setSql('');
    setIdProperty('');
    setError(null);
    setInfo(null);
  }, [layer.id]);

  const meta = React.useMemo(() => getToolMetadata(mapController), [mapController]);
  const desc = meta['filter_by_query']?.description ?? '';

  const apply = async () => {
    setError(null);
    setInfo(null);
    if (!sql.trim() || !idProperty.trim()) {
      setError('SQL and ID property are both required.');
      return;
    }
    setBusy(true);
    try {
      const result = await mapController.filterByQuery(layer.id, sql, idProperty, mcpClient);
      if (result.success) {
        recorder.record('filter_by_query', {
          layer_id: layer.id,
          sql,
          id_property: idProperty,
          id_count: result.idCount,
        });
        if (result.idCount === 0) {
          setInfo(result.message ?? 'Query matched no features.');
        } else {
          setInfo(`Applied — ${result.idCount} feature${result.idCount === 1 ? '' : 's'} match.`);
        }
        onChange();
      } else {
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="jp-GeoAgent-field jp-GeoAgent-tool-form">
      <div className="jp-GeoAgent-field-label">
        <span>Filter by SQL query</span>
      </div>
      <textarea
        className="jp-GeoAgent-textarea"
        rows={4}
        value={sql}
        onChange={e => setSql(e.target.value)}
        placeholder="SELECT HYBAS_ID FROM read_parquet('s3://...') WHERE UP_AREA > 50000"
      />
      <div className="jp-GeoAgent-field-row">
        <span className="jp-GeoAgent-field-label">ID property</span>
        <input
          type="text"
          className="jp-GeoAgent-input"
          value={idProperty}
          onChange={e => setIdProperty(e.target.value)}
          placeholder="_cng_fid"
        />
      </div>
      {error && <div className="jp-GeoAgent-error">{error}</div>}
      {info && <div className="jp-GeoAgent-info">{info}</div>}
      <div className="jp-GeoAgent-field-row">
        <button
          className="jp-GeoAgent-button jp-GeoAgent-button-small"
          onClick={apply}
          disabled={busy}
        >
          {busy ? 'Running…' : 'Apply'}
        </button>
      </div>
      {desc && (
        <details className="jp-GeoAgent-tool-form-help">
          <summary>SQL filter syntax (from geo-agent)</summary>
          <pre>{desc}</pre>
        </details>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Thread `mcpClient` into `LayerDetails`**

In `src/components/LayerDetails.tsx`, update `LayerDetailsProps` to accept an optional MCP client:

```tsx
import { MCPClientWrapper } from '../core/mcp';
// ...existing imports...

export interface LayerDetailsProps {
  layer: LayerState;
  mapController: MapViewController | null;
  recorder: ToolCallRecorder;
  mcpClient?: MCPClientWrapper | null;
  onChange: () => void;
}
```

Add `mcpClient` to the destructured props in the component signature.

- [ ] **Step 3: Import and render the form**

Add the import:

```tsx
import { FilterByQueryForm } from './tool-forms/FilterByQueryForm';
```

Render it conditionally after `SetFilterForm`:

```tsx
      {layer.type === 'vector' && mcpClient && (
        <FilterByQueryForm
          layer={layer}
          mapController={mapController!}
          recorder={recorder}
          mcpClient={mcpClient}
          onChange={onChange}
        />
      )}
```

- [ ] **Step 4: Pass `mcpClient` down from `LayerPanel`**

In `src/components/LayerPanel.tsx`, add `mcpClient` to `LayerPanelProps`:

```tsx
import { MCPClientWrapper } from '../core/mcp';
// ...

export interface LayerPanelProps {
  mapController: MapViewController | null;
  recorder: ToolCallRecorder;
  refreshKey: number;
  pendingSelection?: { id: string; seq: number } | null;
  mcpClient?: MCPClientWrapper | null;
}
```

Destructure `mcpClient` in the component signature, then pass it through to `LayerDetails`:

```tsx
      {selectedLayer && (
        <LayerDetails
          layer={selectedLayer}
          mapController={mapController}
          recorder={recorder}
          mcpClient={mcpClient}
          onChange={forceUpdate}
        />
      )}
```

- [ ] **Step 5: Wire `mcpClient` from `GeoAgentApp`**

In `src/components/GeoAgentApp.tsx`, pass the existing `mcpClient` state into `LayerPanel`:

```tsx
          {activeTab === 'layers' && (
            <LayerPanel
              mapController={mapController}
              recorder={recorderRef.current}
              refreshKey={layerRefreshKey}
              pendingSelection={pendingLayerSelection}
              mcpClient={mcpClient}
            />
          )}
```

- [ ] **Step 6: Add CSS classes**

In `style/base.css`, append at the end of the file:

```css
/* ── Tool forms ── */

.jp-GeoAgent-tool-form {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--jp-border-color1);
}

.jp-GeoAgent-tool-form-current {
  font-size: var(--jp-ui-font-size0);
  color: var(--jp-ui-font-color2);
  margin-bottom: 4px;
  overflow-x: auto;
}

.jp-GeoAgent-tool-form-current code {
  font-family: var(--jp-code-font-family);
  font-size: var(--jp-code-font-size);
  background: var(--jp-layout-color0);
  padding: 1px 4px;
  border-radius: 2px;
}

.jp-GeoAgent-tool-form-help {
  margin-top: 6px;
  font-size: var(--jp-ui-font-size0);
}

.jp-GeoAgent-tool-form-help summary {
  cursor: pointer;
  color: var(--jp-ui-font-color2);
}

.jp-GeoAgent-tool-form-help pre {
  margin: 4px 0 0 0;
  padding: 6px 8px;
  background: var(--jp-layout-color0);
  border: 1px solid var(--jp-border-color2);
  border-radius: 3px;
  font-family: var(--jp-code-font-family);
  font-size: var(--jp-code-font-size);
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}

.jp-GeoAgent-info {
  color: var(--jp-success-color1, #2e7d32);
  font-size: var(--jp-ui-font-size0);
  padding: 4px 0;
}
```

- [ ] **Step 7: Build**

Run: `jlpm build`
Expected: 0 errors.

- [ ] **Step 8: Browser smoke test**

Reload JupyterLab:
1. **Without MCP connected** — add a vector layer. The "Filter by SQL query" section must NOT render. (Only Filter and Style forms appear.)
2. **With MCP connected** — connect via the Query tab's connection UI, then add a vector layer and select it.
3. In the Filter-by-SQL section, paste a valid SQL that returns one column of IDs matching the layer's ID property (use `get_dataset_details` output in the Query tab to find the right column name).
4. Click Apply. "Applied — N features match." appears in green; the map filters to those features.
5. Enter a query that returns no rows. "Query matched no features — filter not applied." appears in green; the filter is untouched.
6. Enter SQL with a bad column name. Red error appears with the ID-property mismatch hint.
7. Expand "SQL filter syntax (from geo-agent)"; confirm full tool description renders.

- [ ] **Step 9: Commit**

```bash
git add src/components/tool-forms/FilterByQueryForm.tsx src/components/LayerDetails.tsx src/components/LayerPanel.tsx src/components/GeoAgentApp.tsx style/base.css
git commit -m "feat(tool-forms): FilterByQueryForm; MCP-gated SQL filter UI"
```

---

### Task 9: Full smoke test + push + PR

**Files:** none (verification + git operations)

- [ ] **Step 1: Final build**

Run: `jlpm build`
Expected: webpack compiled, 0 errors, ~31 warnings (pre-existing).

- [ ] **Step 2: Full browser scenario**

Reload JupyterLab. Connect MCP. Open the GeoAgent panel. Add three layers exercising all paths:

**Vector with default paint (e.g. Ramsar Sites):**
- Slide opacity: layer fades; Style "Current:" opacity updates live.
- Enter `{"fill-color":"#FF1493","fill-opacity":0.5}` into Style → Apply. Color changes to pink.
- Enter `["==",["get","Wetland Type"],"Lake"]` into Filter → Apply. Only lake-type sites render.
- Reset Filter to default. Reset Style to default.

**Vector with match-expression default (e.g. WDPA):**
- Style "Current:" shows the full `["match", ...]` expression.
- Slide opacity — match expression is **preserved** in the "Current:" readout (correctness check for the old clobbering bug).
- Apply a new match expression. Colors update.
- Filter by SQL: `SELECT HYBAS_ID FROM read_parquet('...') WHERE ...` with `id_property: HYBAS_ID` (or the relevant column). Applied; map filters; "N features match" in green.

**Raster (e.g. Vulnerable Carbon):**
- Colormap dropdown still works.
- Rescale inputs still work.
- Opacity slider still works.
- No Filter / SetStyle forms (they're vector-only gates — verify).

**Version switcher (e.g. HydroBASINS L3→L6):**
- Switcher still works; after switching versions, the Style form's "Current:" reflects the new version's paint.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin issue-3-layer-config-ui
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "Layer configuration UI (issue #3) — tool-forms redesign" --body "$(cat <<'EOF'
## Summary

Rebuilds the LayerDetails pane around geo-agent's map-tool surface. The human UI and the LLM tool calls now invoke the same operations through the same code path with the same recorded tool names.

- **Filter form** wraps `set_filter` / `clear_filter` / `reset_filter` — accepts any MapLibre filter expression.
- **Style form** wraps `set_style` / `reset_style` — accepts any MapLibre paint object including `match` / `interpolate` / `step` expressions.
- **Filter-by-SQL form** wraps `filter_by_query` — rendered only when MCP is connected.
- Opacity slider, colormap dropdown, rescale inputs, and version switcher retained as bespoke controls (those tools don't exist upstream yet; tracked separately).

Help text for each form is imported dynamically from `geo-agent/app/map-tools.js` via a 5-line `MapManager` shim, so upstream refinements propagate on `yarn upgrade`.

Closes the fill-color-clobbers-match-expression bug by removing the single-property color picker entirely.

## Specs

- Spec: `docs/superpowers/specs/2026-04-15-layer-tool-forms-design.md`
- Plan: `docs/superpowers/plans/2026-04-15-layer-tool-forms.md`
- Related: boettiger-lab/jupyter-geoagent#2 (geo-agent-core extraction), boettiger-lab/jupyter-geoagent#3 (this issue), boettiger-lab/jupyter-geoagent#4 (Tier 3 follow-ups)

## Test plan

- [ ] Build clean (`jlpm build` — 0 errors)
- [ ] Vector layer: Filter form applies/clears/resets a MapLibre expression
- [ ] Vector layer: Style form applies a match expression
- [ ] WDPA-style layer: slider does not clobber the match expression
- [ ] With MCP: filter_by_query applies, matches-zero shows green note, bad column shows red error
- [ ] Raster layer: colormap, rescale, opacity still work
- [ ] Versioned layer: switcher still works and Style "Current:" reflects the new version
EOF
)"
```

- [ ] **Step 5: Capture PR URL**

Print the URL from the previous command's output for the user.

---

## Self-Review Against Spec

**1. Spec coverage.**

| Spec requirement | Task |
|---|---|
| `src/components/tool-forms/` dir with 3 components | Tasks 4, 6, 8 |
| `setStyle` on controller; spreads keys, updates `currentStyle` | Task 2 |
| `resetStyle` / `resetFilter` on controller | Task 2 |
| `filterByQuery` on controller; ports SQL wrap + NULL handling + ID parse | Task 7 |
| Remove `setFillColor` | Task 6 |
| Rename `paint` → `defaultStyle`; add `currentStyle` | Task 1 |
| Remove fill-color picker block | Task 6 |
| Remove categorical filter builder block | Task 5 |
| Remove standalone default-filter display | Task 5 |
| Keep opacity / colormap / rescale / version switcher | (not touched; verify in Task 9) |
| Inline help from geo-agent tool descriptions via dynamic import | Task 3 + used in 4, 6, 8 |
| `.jp-GeoAgent-info` CSS class | Task 8 |
| Recorder tool names match geo-agent | Tasks 4, 6, 8 (`set_filter` / `clear_filter` / `reset_filter` / `set_style` / `reset_style` / `filter_by_query`) |
| Local form state; re-sync only on layer change / Apply / Clear / Reset | Tasks 4, 6 (explicit `[layer.id]` dep + explicit `setText` after success) |
| filter_by_query NULL / non-parseable / MCP-error cases | Task 7 |
| Reuse: dynamic import of `createMapTools` + minimal shim | Task 3 |
| Export `layer.currentStyle ?? layer.defaultStyle` in ExportPanel | Task 1 |
| Success criterion: WDPA match expression survives opacity slider | Task 9 smoke test |

All spec requirements are mapped.

**2. Placeholders.** No "TBD" / "implement later" / "similar to task N" found. Every step has full code.

**3. Type consistency.**

- `MapViewController` methods — `setStyle(layerId, style)`, `resetStyle(layerId)`, `resetFilter(layerId)`, `filterByQuery(layerId, sql, idProperty, mcpClient)` — used identically in controller task and form tasks.
- `LayerState.defaultStyle` / `currentStyle` — consistent in types, controller, forms, and ExportPanel.
- `ToolMetadata` type — defined in Task 3, consumed in Tasks 4, 6, 8 under the same shape.
- Recorder tool names — `set_filter`, `clear_filter`, `reset_filter`, `set_style`, `reset_style`, `filter_by_query` — verbatim matches to geo-agent's `map-tools.js`.
- `MCPClientWrapper` — imported from `../core/mcp` in Tasks 7, 8 consistently.
