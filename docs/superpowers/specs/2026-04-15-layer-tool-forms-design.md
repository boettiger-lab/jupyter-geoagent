# Layer Tool-Forms Design

**Date:** 2026-04-15
**Context:** Follow-up redesign of the LayerDetails pane (issue #3 UI), branching from `issue-3-layer-config-ui`.

## Motivation

The current LayerDetails pane exposes bespoke GUI controls for a small subset of layer styling operations (fill-color picker, categorical-values filter builder). Two problems surfaced in testing:

1. **Coverage gap.** Real-world configs (e.g. wetlands-v2 WDPA) use MapLibre `match` expressions to color features by data field — `{"fill-color": ["match", ["get", "IUCN_CAT"], "Ia", "#26633A", ...]}`. The GUI can't author these; it can only pick a single hex color.

2. **Correctness gap.** Clicking the fill-color picker on a layer that already has a match expression silently *replaces* the expression with a single color, destroying the data-driven styling with no way to recover short of re-adding the layer.

Filtering has an analogous gap: the categorical-values builder handles equality-on-one-column, but not ranges, conjunctions, or SQL-driven filters. And the GUI for "filter by SQL query" doesn't exist at all, though the LLM already does this via `filter_by_query`.

## Core insight

geo-agent already exposes a mature tool surface for map manipulation (`src/components/map-tools.js` in geo-agent, visible in `node_modules/geo-agent/app/map-tools.js`). The LLM drives the map through `set_filter`, `set_style`, `clear_filter`, `reset_filter`, `reset_style`, `filter_by_query`, etc. — each with a documented input schema and help text.

**The design: make the LayerDetails pane a direct mirror of this tool surface.** Each tool becomes a small React form. The human invokes the same operations the LLM does, through the same code path, recorded with the same tool names. A session replay or export is uniform regardless of who drove it.

## Scope

### In scope

- New directory `src/components/tool-forms/` with three components:
  - `SetFilterForm.tsx` — wraps `set_filter`, `clear_filter`, `reset_filter`
  - `SetStyleForm.tsx` — wraps `set_style`, `reset_style`
  - `FilterByQueryForm.tsx` — wraps `filter_by_query` (rendered only when `mcpClient` is non-null)
- `MapViewController` additions:
  - `setStyle(layerId, style: Record<string, any>)` — spreads the paint object via `setPaintProperty` per key; leaves unspecified keys untouched; updates `state.currentStyle`.
  - `resetStyle(layerId)` — reapplies `state.defaultStyle`.
  - `resetFilter(layerId)` — applies `state.defaultFilter` (or clears if none).
  - `filterByQuery(layerId, sql, idProperty, mcpClient)` — ports the ~20 lines from geo-agent's tool implementation.
  - Remove `setFillColor` (superseded).
- `LayerState` refactor: rename `paint` → `defaultStyle`; add `currentStyle?: Record<string, any>`.
- `LayerDetails.tsx` restructure: remove the fill-color picker, categorical filter builder, and standalone "Default filter" JSON display. Integrate the three form components. Keep the opacity slider, colormap dropdown, rescale inputs, and version switcher as bespoke controls (those tool equivalents don't exist upstream yet).
- Inline help text in each form, sourced dynamically from the corresponding geo-agent tool description (see Reuse section) so the human sees the same "never use legacy `in`, use `match` instead" guidance the LLM sees.
- New CSS class `.jp-GeoAgent-info` for the green "query matched no features" note.
- Recorder tool names matched to geo-agent exactly: `set_filter`, `clear_filter`, `reset_filter`, `set_style`, `reset_style`, `filter_by_query`.

### Out of scope (deferred)

- **Upstream geo-agent additions.** `set_opacity`, `set_colormap`, `set_rescale`, `switch_version` tools that would complete the mirror. Tracked as a follow-up spec on geo-agent itself; until those exist, the slider/dropdown/inputs/version switcher stay as bespoke controls calling `MapViewController` methods directly and are not represented as tools in the recorder.
- **LLM-assisted expression generation.** Describe-in-natural-language → get-JSON-back. Eventual nice-to-have; not this PR.
- **Schema-driven generic form.** A fallback that would light up any new tool geo-agent adds, automatically. Explicitly deferred — hand-crafted per tool for now.
- **Map-level tools.** `fly_to`, `set_projection`, `get_dataset_details`, `list_datasets`, `get_map_state` — not LayerDetails concerns.
- **Tests.** Consistent with the rest of this codebase; verify by browser smoke-test.

## Reuse of geo-agent

### Already reused

- `DatasetCatalog` (from `geo-agent/app/dataset-catalog.js`) — the entire STAC collection-processing pipeline, consumed via `src/core/stac.ts`.
- Types: `MapLayerConfig`, `DatasetEntry`, `ColumnInfo` (shimmed in `src/typings/geo-agent.d.ts`).

### Added by this PR

**Tool metadata (descriptions + input schemas): dynamic import.** We import `createMapTools` from `geo-agent/app/map-tools.js` and invoke it with a minimal `MapManager`-shaped shim (just `getLayerIds()` and `getVectorLayerIds()` — the only methods the description templates consume). We extract `{ name, description, inputSchema }` from each returned tool and bind them to the corresponding form's help text and validation. The tools' `execute` functions are ignored; our forms call `MapViewController` directly.

Benefit: when geo-agent refines a tool description (e.g. "never use legacy `in` — use `match` instead"), our form help text updates for free on the next `yarn upgrade`. No copy-paste drift.

Risk: coupling to the `createMapTools` signature. Small surface; tolerable. A breaking upstream rename is caught at build time (TypeScript error).

### Duplicated by this PR, with rationale

| Duplicated | Why |
|---|---|
| MapLibre layer management (`MapViewController`) | geo-agent's `MapManager` is tied to its non-React UI and JupyterLab's sizing needs are different. Incompatible lifecycles. |
| Thin execute wrappers (`setFilter`, `setStyle`, etc.) | 3–5 lines each around MapLibre APIs. Written against our `MapViewController`; low-value to share. |
| `filter_by_query` SQL-wrap + result-parse logic (~20 lines) | Ports geo-agent's `map-tools.js` `filter_by_query.execute`. Substantive logic (DuckDB `array_agg…FILTER`, NULL handling, ID-array parsing). See follow-up note below. |
| `ToolCallRecorder` | Our minimal version. geo-agent's is entangled with its chat-UI transcript plumbing. |

### Follow-up: `geo-agent-core` extraction

boettiger-lab/jupyter-geoagent#2 already proposes extracting `DatasetCatalog`, `ToolRegistry`, `MCPClient`, and `createMapTools` into a shared `@boettiger-lab/geo-agent-core` package, with the web app continuing to deploy as static CDN. The dynamic-import approach above is forward-compatible — when `-core` lands, it's a one-line import swap:

```ts
// before:  import { createMapTools } from 'geo-agent/app/map-tools.js';
// after:   import { createMapTools } from '@boettiger-lab/geo-agent-core';
```

At that point, the `filter_by_query` wrapping logic ported here should also be re-extracted as a pure helper (`wrapIdQuery(sql, col)` + `parseIdArray(result)`) in `-core`, removing the ~20-line duplication.

## Architecture

### Component structure

```
src/components/
├── LayerDetails.tsx          (orchestrator, trimmed)
├── tool-forms/
│   ├── SetFilterForm.tsx
│   ├── SetStyleForm.tsx
│   └── FilterByQueryForm.tsx
```

Each form component:
- Reads current state from the `LayerState` prop.
- Pre-fills its input(s) from the layer's live filter/style.
- On Apply, calls a `MapViewController` method, then records the matching tool name via `ToolCallRecorder`.
- Displays errors inline under the input on JSON parse failure or MapLibre throw.
- Includes inline help text (MapLibre expression examples) lifted from the tool description.

### MapViewController additions

```ts
setStyle(layerId: string, style: Record<string, any>): boolean {
  const state = this.layers.get(layerId);
  if (!state || !this.map.getLayer(layerId)) return false;
  for (const [key, value] of Object.entries(style)) {
    this.map.setPaintProperty(layerId, key, value);
  }
  state.currentStyle = { ...state.currentStyle, ...style };
  if ('fill-opacity' in style && typeof style['fill-opacity'] === 'number') {
    state.opacity = style['fill-opacity'];
  }
  return true;
}

resetStyle(layerId: string): boolean {
  const state = this.layers.get(layerId);
  if (!state || !state.defaultStyle) return false;
  return this.setStyle(layerId, state.defaultStyle);
}

resetFilter(layerId: string): boolean {
  const state = this.layers.get(layerId);
  if (!state) return false;
  if (state.defaultFilter) {
    return this.setFilter(layerId, state.defaultFilter);
  }
  return this.clearFilter(layerId);
}

async filterByQuery(
  layerId: string,
  sql: string,
  idProperty: string,
  mcpClient: MCPClientWrapper,
): Promise<{ success: boolean; idCount?: number; error?: string; message?: string }> {
  // Ports geo-agent/app/map-tools.js filter_by_query:
  // 1. Wrap SQL: SELECT array_agg("col") FILTER (WHERE "col" IS NOT NULL) FROM (${sql}) _filter_subquery
  // 2. Call mcpClient.callTool('query', { sql_query: wrapped })
  // 3. Parse id array; handle NULL result as "no rows matched"
  // 4. Apply filter ['in', ['get', idProperty], ['literal', ids]]
}
```

### LayerState refactor

```ts
export interface LayerState {
  // ...unchanged fields...
  defaultStyle?: Record<string, any>;  // was: paint
  currentStyle?: Record<string, any>;  // NEW: merged live paint, for form readback
  // ...rest unchanged...
}
```

`defaultStyle` is captured once at `addLayer` time from `config.defaultStyle`. `currentStyle` starts equal to `defaultStyle` and is updated by `setStyle` calls.

## Pane layout

Top to bottom in the LayerDetails pane:

```
─── Layer Details ───
  <Layer display name>

  [Version ▼ …]                         (only if versions > 1)

  Opacity     ────●──────   0.50

  Colormap    [viridis ▼]               (raster only)
  Rescale     [min] [max]  [Apply]      (raster only)

  ──────────────────────────────────
  Filter                                (vector only)
  Current: ["match",["get","IUCN_CAT"],…]
  [ textarea prefilled with current ]
  [ Apply ]  [ Clear ]  [ Reset to default ]
  ⓘ match / ==, != / all, any / never "in" legacy

  ──────────────────────────────────
  Style
  Current: {"fill-color":…, "fill-opacity":0.5}
  [ textarea prefilled with currentStyle ]
  [ Apply ]  [ Reset to default ]
  ⓘ Simple / Match / Interp / Step examples

  ──────────────────────────────────
  Filter by SQL query                   (only if MCP connected)
  [ SQL textarea ]
  ID property [ _cng_fid ]
  [ Apply ]
```

Notable choices:

1. **Always expanded, no progressive-disclosure.** The pane already scrolls; collapsing sections adds clicks without saving much real-estate.
2. **Redundant "Current:" readout** above each textarea. Stable reference the user can see while editing.
3. **Standalone "Default filter" block removed.** Implicit in the Reset button.

## Error handling and state sync

### Input validation

- `SetFilterForm` — `JSON.parse`; must parse to an array. On failure: inline red "Filter must be a JSON array (MapLibre expression)." + parse error.
- `SetStyleForm` — `JSON.parse`; must parse to a plain object. Keys are not pre-validated (MapLibre is authoritative).
- `FilterByQueryForm` — both fields non-empty; SQL sanity-check is deferred to the MCP server.

Errors render in `.jp-GeoAgent-error` beneath the relevant textarea.

### MapLibre runtime errors

`setFilter` and `setPaintProperty` throw synchronously on invalid input. Each form wraps its call in try/catch and displays the thrown `.message` in the same error slot. **Failed attempts are not recorded** — matching the LLM path, which only records tool calls on success.

### State sync after apply

Each textarea is **locally controlled** (form-local `useState`) so user edits aren't clobbered by unrelated re-renders (e.g. an LLM call updating some other layer's state). The local state is seeded from the layer's current filter/style and re-synced only on:

- the selected layer changing (`layer.id` dep) — new layer, new starting point;
- a successful Apply of this form's operation — re-fills from the freshly-applied state;
- a successful Clear or Reset — re-fills from the cleared/default state.

The "Current:" readout above each textarea is always live (reads `layer.filter` / `layer.currentStyle` on every render), so the user can see what's applied even if their in-progress edit differs.

On success, the form calls `onChange` (passed from `LayerDetails`), which triggers the parent's `forceUpdate` so the "Current:" readouts re-read fresh state.

`FilterByQueryForm` success updates `state.filter` to the generated `['in', ['get', col], ['literal', ids]]` expression — `SetFilterForm`'s "Current:" line then shows that expression. Because `SetFilterForm`'s textarea is locally controlled, it does *not* auto-overwrite a user's in-progress edit; the user sees the expression in "Current:" and can choose to Reset or keep typing.

### filter_by_query failure modes

Ported verbatim from geo-agent:
- MCP returns NULL (no rows match) → success status, green `.jp-GeoAgent-info` note "Query matched no features — filter not applied."
- MCP returns non-parseable result → error with the ID-property-mismatch hint ("Could not parse ID list from query result. Check that id_property exactly matches the column name…").
- MCP call throws → error `SQL execution failed: ${err.message}`.

## Success criteria

1. A user can paste
   ```json
   {"fill-color": ["match", ["get","IUCN_CAT"],
      "Ia","#26633A", "Ib","#26633A", "II","#3E9C47",
      "III","#7EB3D3", "IV","#7EB3D3",
      "V","#BDBDBD", "VI","#BDBDBD",
      "#888888"],
    "fill-opacity": 0.6}
   ```
   into the Style textarea, hit Apply, and see WDPA recolor by IUCN category.
2. A user can type
   ```json
   ["all", ["==", ["get","Wetland Type"], "Lake"], [">", ["get","Area (ha)"], 100]]
   ```
   into the Filter textarea, hit Apply, and see only matching features render.
3. With MCP connected, a user can type
   - SQL: `SELECT HYBAS_ID FROM read_parquet('s3://.../hydrobasins.parquet') WHERE UP_AREA > 50000`
   - ID property: `HYBAS_ID`
   and Apply — HydroBASINS filters to large watersheds without thousands of IDs passing through the agent context.
4. The `ToolCallRecorder` output for those three actions matches exactly what the LLM would produce for the same intent.
5. Pre-existing opacity / colormap / rescale / version switcher paths unchanged.
6. The fill-color-clobbers-match-expression class of bugs no longer exists: the single-property color picker is gone, `setStyle` is the only paint mutation path and it takes the whole paint object as explicit user intent.

## Branch strategy

Continuation of the `issue-3-layer-config-ui` branch. The tool-form redesign *replaces* portions of the layer-config UI built there (fill-color picker, categorical filter builder) and extends the rest. Bundling lets reviewers see the final shape in one PR rather than reviewing intermediate controls we're about to remove.

Alternative considered: a fresh branch off `main` that supersedes the existing one. Rejected because the controller / LayerState / LayerDetails scaffolding from issue #3 is still needed and would need to be re-done.
