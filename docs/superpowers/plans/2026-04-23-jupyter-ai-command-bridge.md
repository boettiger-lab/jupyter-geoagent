# Jupyter-AI Command Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose jupyter-geoagent's map-control tools as JupyterLab commands so jupyter-ai personas (OpenCode, Claude, Goose) can drive the map via natural-language chat, matching the behavior of the standalone geo-agent web app.

**Architecture:** A `MapManagerAdapter` wraps `MapViewController` to satisfy the `geo-agent/app/map-tools.js` `MapManager` contract (`{success, ...}` return shapes, `getMapState`, `syncCheckbox`, etc.). Commands are registered **once** at extension activation, keyed off a module-scoped *active panel* reference that each `GeoAgentPanel` updates on mount/dispose. Each command dispatches through `createMapTools()` so descriptions and argument schemas match the JS geo-agent verbatim — no manual metadata drift. The pipeline `jupyter_server_mcp` → `jupyterlab_commands_toolkit.execute_command` → `app.commands.execute()` is already installed in `.venv`; we only need to register the commands.

**Tech Stack:** TypeScript, JupyterLab 4 CommandRegistry (`describedBy.args` for JSON-Schema exposure), `geo-agent/app/map-tools.js` (tool definitions), `jupyter_server_mcp` + `jupyterlab_commands_toolkit` (MCP-over-events bridge, already installed).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/map-manager-adapter.ts` | Create | Adapter that exposes `MapViewController` through the geo-agent `MapManager` surface expected by `createMapTools` |
| `src/core/active-panel.ts` | Create | Module-scoped active-panel ref + setter/getter; holds `{controller, mcpClient, recorder, refresh}` |
| `src/commands.ts` | Create | `registerGeoAgentCommands(app)` — registers one JupyterLab command per geo-agent map tool with `describedBy.args` schema |
| `src/index.ts` | Modify | Call `registerGeoAgentCommands(app)` once in plugin activate |
| `src/components/GeoAgentApp.tsx` | Modify | On `mapController` + `mcpClient` ready, call `setActivePanel(...)`; clear on unmount |
| `src/typings/geo-agent.d.ts` | Modify | Extend `createMapTools` type to reflect async-capable `execute` |

---

## Non-goals (for this plan)

- **Catalog tools** (`list_datasets`, `get_dataset_details`) — jupyter-geoagent uses MCP-backed catalog (`src/core/mcp-catalog.ts`), not geo-agent's sync `DatasetCatalog`. LLMs can call MCP catalog tools directly via the remote MCP server, so bridging these through commands is redundant. Skip.
- **`set_projection`** — requires a globe/mercator toggle in `MapViewController`, which doesn't exist yet. Add in a later plan.
- **Python entry-point wrapper** under `jupyter_server_mcp.tools` — would give friendlier tool names (`show_dataset` vs `execute_command("geoagent:show_dataset")`), but adds a Python module + packaging. Defer to a follow-up.

## Tools registered in this plan (10)

`show_layer`, `hide_layer`, `set_filter`, `clear_filter`, `reset_filter`, `set_style`, `reset_style`, `fly_to`, `filter_by_query`, `get_map_state`.

---

### Task 1: Adapter — core map-manipulation methods

**Files:**
- Create: `src/core/map-manager-adapter.ts`

The geo-agent `MapManager` surface used by `createMapTools` is: `getLayerIds()`, `getVectorLayerIds()`, `showLayer(id)`, `hideLayer(id)`, `setFilter(id, filter)`, `clearFilter(id)`, `resetFilter(id)`, `setStyle(id, paint)`, `resetStyle(id)`, `flyTo({center, zoom})`, `getMapState()`, `setProjection(type)`, `syncCheckbox(id)`. Return shapes are `{success: bool, ...}`. Our `MapViewController` returns booleans and exposes slightly different state. This adapter bridges both.

- [ ] **Step 1: Create adapter with pass-through and return-shape translation**

```ts
// src/core/map-manager-adapter.ts
/**
 * Adapter that exposes MapViewController through the MapManager surface
 * expected by geo-agent/app/map-tools.js createMapTools().
 *
 * Two translations happen here:
 *   1. Return shapes: MapViewController returns booleans; MapManager tools
 *      expect { success: true, layer, ... } on success, { success: false,
 *      error: "..." } on failure (with helpful "Available: a, b, c" hints).
 *   2. Method names: getMapState (not getViewState), syncCheckbox (which
 *      becomes a UI-refresh trigger).
 */

import type { MapViewController } from '../components/MapView';

export interface MapManagerAdapterOptions {
  /** Called after any state-mutating operation so React panels re-render. */
  onChange?: () => void;
}

export class MapManagerAdapter {
  constructor(
    private controller: MapViewController,
    private options: MapManagerAdapterOptions = {},
  ) {}

  // --- layer id enumerations (used by tool descriptions) ---

  getLayerIds(): string[] {
    return [...this.controller.layers.keys()];
  }

  getVectorLayerIds(): string[] {
    return [...this.controller.layers.entries()]
      .filter(([, s]) => s.type === 'vector')
      .map(([id]) => id);
  }

  // --- show / hide ---

  showLayer(layerId: string) {
    const state = this.controller.layers.get(layerId);
    if (!state) {
      return { success: false, error: `Unknown layer: ${layerId}. Available: ${this.getLayerIds().join(', ') || '(none)'}` };
    }
    this.controller.showLayer(layerId);
    this.options.onChange?.();
    return { success: true, layer: layerId, displayName: state.displayName, visible: true };
  }

  hideLayer(layerId: string) {
    const state = this.controller.layers.get(layerId);
    if (!state) {
      return { success: false, error: `Unknown layer: ${layerId}. Available: ${this.getLayerIds().join(', ') || '(none)'}` };
    }
    this.controller.hideLayer(layerId);
    this.options.onChange?.();
    return { success: true, layer: layerId, displayName: state.displayName, visible: false };
  }

  // --- filter ---

  setFilter(layerId: string, filter: any) {
    const state = this.controller.layers.get(layerId);
    if (!state) return { success: false, error: `Unknown layer: ${layerId}` };
    if (state.type !== 'vector') return { success: false, error: `Layer '${layerId}' is raster — filtering only works on vector layers` };

    if (filter === null || filter === undefined) {
      this.controller.clearFilter(layerId);
    } else {
      this.controller.setFilter(layerId, filter);
    }
    this.options.onChange?.();

    const features = this.controller.map.queryRenderedFeatures({ layers: [layerId] });
    const result: any = {
      success: true,
      layer: layerId,
      displayName: state.displayName,
      filter: filter ?? null,
      featuresInView: features.length,
    };
    if (filter && features.length === 0) {
      result.warning = 'No features match this filter in the current view. Filter may be too restrictive or property values may not match. Use filter_by_query to verify via SQL.';
    }
    return result;
  }

  clearFilter(layerId: string) {
    return this.setFilter(layerId, null);
  }

  resetFilter(layerId: string) {
    const state = this.controller.layers.get(layerId);
    if (!state) return { success: false, error: `Unknown layer: ${layerId}` };
    return this.setFilter(layerId, state.defaultFilter ?? null);
  }

  // --- style ---

  setStyle(layerId: string, paintProps: Record<string, any>) {
    const state = this.controller.layers.get(layerId);
    if (!state) return { success: false, error: `Unknown layer: ${layerId}` };

    const updates: Array<{ property: string; success: boolean; error?: string }> = [];
    for (const [prop, value] of Object.entries(paintProps)) {
      try {
        this.controller.setStyle(layerId, { [prop]: value });
        updates.push({ property: prop, success: true });
      } catch (err: any) {
        updates.push({ property: prop, success: false, error: err.message });
      }
    }
    this.options.onChange?.();
    return { success: true, layer: layerId, displayName: state.displayName, updates };
  }

  resetStyle(layerId: string) {
    const state = this.controller.layers.get(layerId);
    if (!state) return { success: false, error: `Unknown layer: ${layerId}` };
    this.controller.resetStyle(layerId);
    this.options.onChange?.();
    return { success: true, layer: layerId, displayName: state.displayName };
  }

  // --- view ---

  flyTo({ center, zoom }: { center: [number, number]; zoom?: number }) {
    this.controller.flyTo(center, zoom);
    return { success: true, center, zoom: zoom ?? this.controller.map.getZoom() };
  }

  getMapState() {
    const layers: Record<string, any> = {};
    for (const [id, state] of this.controller.layers) {
      layers[id] = {
        displayName: state.displayName,
        type: state.type,
        visible: state.visible,
        opacity: state.opacity,
        filter: state.filter ?? null,
      };
    }
    const view = this.controller.getViewState();
    return { success: true, view, layers };
  }

  // --- no-op on our side; geo-agent's tool code calls this to sync a legacy DOM checkbox ---
  syncCheckbox(_layerId: string): void {
    this.options.onChange?.();
  }

  // setProjection not supported yet — see plan non-goals.
  setProjection(_type: string) {
    return { success: false, error: 'Projection switching is not yet implemented in jupyter-geoagent.' };
  }
}
```

- [ ] **Step 2: Verify the adapter type-checks**

Run: `jlpm build:lib`
Expected: no errors. If `jlpm` is missing try `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add src/core/map-manager-adapter.ts
git commit -m "feat: add MapManagerAdapter bridging MapViewController to geo-agent MapManager contract"
```

---

### Task 2: Active panel registry

**Files:**
- Create: `src/core/active-panel.ts`

The command handlers are registered once, but they need access to the currently-focused panel's controller, MCP client, recorder, and refresh callback. A module-scoped ref holds these; panels update it on mount.

- [ ] **Step 1: Create the registry module**

```ts
// src/core/active-panel.ts
/**
 * Module-scoped reference to the currently active GeoAgent panel.
 *
 * Commands registered at plugin-activate time dereference this to find the
 * panel to operate on. Panels set it on mount and clear it on unmount.
 * Multi-panel UX: last-mounted wins — matches the ArcGIS "active frame"
 * idiom. (If both panels are open, the LLM operates on whichever was most
 * recently shown.)
 */

import type { MapViewController } from '../components/MapView';
import type { MCPClientWrapper } from './mcp';
import type { ToolCallRecorder } from './tools';

export interface ActivePanel {
  controller: MapViewController;
  mcpClient: MCPClientWrapper | null;
  recorder: ToolCallRecorder;
  /** Called after any tool mutation so React panels re-render. */
  refresh: () => void;
}

let current: ActivePanel | null = null;

export function setActivePanel(panel: ActivePanel | null): void {
  current = panel;
}

export function getActivePanel(): ActivePanel | null {
  return current;
}
```

- [ ] **Step 2: Type-check**

Run: `jlpm build:lib`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/active-panel.ts
git commit -m "feat: add active-panel registry for LLM command routing"
```

---

### Task 3: Relax geo-agent.d.ts execute typing

**Files:**
- Modify: `src/typings/geo-agent.d.ts`

`createMapTools`'s `execute` can return a promise (e.g. `filter_by_query` is async). The current declaration says `any`, which technically works but is loose. Tighten to `any | Promise<any>` for clarity.

- [ ] **Step 1: Adjust the declaration**

Change `src/typings/geo-agent.d.ts` lines 30-41 from:

```ts
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

to:

```ts
declare module 'geo-agent/app/map-tools.js' {
  export function createMapTools(
    mapManager: any,
    catalog: any,
    mcpClient?: any
  ): Array<{
    name: string;
    description: string;
    inputSchema: any;
    execute: (args: Record<string, any>) => any | Promise<any>;
  }>;
}
```

- [ ] **Step 2: Type-check**

Run: `jlpm build:lib`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/typings/geo-agent.d.ts
git commit -m "chore: allow Promise return from createMapTools execute"
```

---

### Task 4: Command registration

**Files:**
- Create: `src/commands.ts`

The registration loops over the tool set from `createMapTools()` using the active panel's adapter + MCP client. Commands go through the adapter for every call (not cached), so a new panel's state is picked up without re-registering. The `label`, `caption`, and `describedBy.args` fields populate `list_all_commands` for the LLM.

- [ ] **Step 1: Write the command registrar**

```ts
// src/commands.ts
/**
 * Register one JupyterLab command per geo-agent map tool.
 *
 * Wiring:
 *   app.commands.addCommand('geoagent:<tool_name>', { execute, describedBy })
 *     → jupyter-ai persona calls execute_command (via jupyter_server_mcp MCP tool)
 *     → jupyterlab_commands_toolkit emits a jupyterlab-command/v1 event
 *     → the frontend event listener calls app.commands.execute('geoagent:<tool_name>', args)
 *     → this handler looks up the active panel and dispatches through createMapTools()
 *
 * Call this once at plugin activation. Commands stay registered for the
 * lifetime of the JupyterLab session; they error clearly if no panel is open.
 */

import { JupyterFrontEnd } from '@jupyterlab/application';
import { createMapTools } from 'geo-agent/app/map-tools.js';
import { MapManagerAdapter } from './core/map-manager-adapter';
import { getActivePanel } from './core/active-panel';

/** Skip tools that depend on machinery jupyter-geoagent doesn't provide yet. */
const SKIP_TOOLS = new Set([
  'list_datasets',          // needs DatasetCatalog; jupyter-geoagent uses MCP-backed catalog
  'get_dataset_details',    // same
  'set_projection',         // MapViewController doesn't implement globe/mercator toggle
]);

const NO_PANEL_ERROR = JSON.stringify({
  success: false,
  error: 'No GeoAgent Map panel is open. Ask the user to open one from the JupyterLab launcher (File → New → GeoAgent Map).',
});

export function registerGeoAgentCommands(app: JupyterFrontEnd): void {
  // Build the tool list once using stubs — we only use each entry's name,
  // description, and inputSchema here. Real mapManager/catalog/mcpClient are
  // resolved inside each execute handler from getActivePanel().
  const stubManager = { getLayerIds: () => [], getVectorLayerIds: () => [] };
  const stubCatalog = { getAll: () => [], get: () => null, getIds: () => [] };
  const stubMcp = {};
  const toolMetadata = createMapTools(stubManager as any, stubCatalog as any, stubMcp as any);

  for (const meta of toolMetadata) {
    if (SKIP_TOOLS.has(meta.name)) continue;

    const commandId = `geoagent:${meta.name}`;

    app.commands.addCommand(commandId, {
      label: `GeoAgent: ${meta.name}`,
      caption: firstLine(meta.description),
      describedBy: { args: meta.inputSchema },
      execute: async (args) => {
        const panel = getActivePanel();
        if (!panel) return NO_PANEL_ERROR;

        const adapter = new MapManagerAdapter(panel.controller, { onChange: panel.refresh });
        // Rebuild the tool with the real adapter + mcpClient so closures bind
        // to the current panel's state.
        const tools = createMapTools(adapter as any, stubCatalog as any, panel.mcpClient ?? undefined);
        const tool = tools.find(t => t.name === meta.name);
        if (!tool) {
          return JSON.stringify({ success: false, error: `Tool '${meta.name}' not found in createMapTools output.` });
        }

        const argsObj = (args ?? {}) as Record<string, any>;
        try {
          const result = await Promise.resolve(tool.execute(argsObj));
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          panel.recorder.record(meta.name, argsObj, resultStr);
          return resultStr;
        } catch (err: any) {
          const errResult = JSON.stringify({ success: false, error: err?.message ?? String(err) });
          panel.recorder.record(meta.name, argsObj, errResult);
          return errResult;
        }
      },
    });
  }
}

function firstLine(s: string): string {
  const idx = s.indexOf('\n');
  return idx === -1 ? s : s.slice(0, idx);
}
```

- [ ] **Step 2: Type-check**

Run: `jlpm build:lib`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands.ts
git commit -m "feat: register geo-agent map tools as JupyterLab commands"
```

---

### Task 5: Wire registration into extension activation

**Files:**
- Modify: `src/index.ts` — add one import and one call in `activate`

- [ ] **Step 1: Import and call the registrar**

In `src/index.ts`, add after the existing `import { GeoAgentPanel } from './panel';` line:

```ts
import { registerGeoAgentCommands } from './commands';
```

Then, inside the `activate` function, immediately after `console.log('jupyter-geoagent extension activated');`:

```ts
    registerGeoAgentCommands(app);
```

The full `activate` function should read:

```ts
  activate: (
    app: JupyterFrontEnd,
    launcher: ILauncher | null,
    restorer: ILayoutRestorer | null,
  ) => {
    console.log('jupyter-geoagent extension activated');
    registerGeoAgentCommands(app);

    const tracker = new WidgetTracker<GeoAgentPanel>({ namespace: 'geoagent' });
    // ... rest unchanged
```

- [ ] **Step 2: Type-check**

Run: `jlpm build:lib`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: register geoagent commands at plugin activation"
```

---

### Task 6: Panels update the active-panel ref on mount/unmount

**Files:**
- Modify: `src/components/GeoAgentApp.tsx` — add a `useEffect` that syncs `setActivePanel` when `mapController` + `mcpClient` are ready; clear on unmount

- [ ] **Step 1: Add the import**

In `src/components/GeoAgentApp.tsx`, add after the existing `import { MCPClientWrapper } from '../core/mcp';` line:

```ts
import { setActivePanel } from '../core/active-panel';
```

- [ ] **Step 2: Add the sync effect**

After the existing `React.useEffect` block that handles MCP connection (the one starting with `React.useEffect(() => { if (!mcpServerUrl) return;`), add a new effect:

```tsx
  // Publish this panel as the active target for LLM-driven commands.
  // Cleared on unmount so stale controllers don't get poked by the next
  // opened panel.
  React.useEffect(() => {
    if (!mapController) return;
    setActivePanel({
      controller: mapController,
      mcpClient,
      recorder: recorderRef.current,
      refresh: () => setLayerRefreshKey(k => k + 1),
    });
    return () => {
      setActivePanel(null);
    };
  }, [mapController, mcpClient]);
```

- [ ] **Step 3: Type-check**

Run: `jlpm build:lib`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/GeoAgentApp.tsx
git commit -m "feat: sync GeoAgentApp lifecycle to active-panel ref"
```

---

### Task 7: Production build and local install

**Files:** (none — runs commands)

- [ ] **Step 1: Production build**

Run: `jlpm build:prod`
Expected: compiles cleanly, writes `jupyter_geoagent/labextension/static/*.js`.

- [ ] **Step 2: Reinstall (picks up the new labextension bundle)**

Run: `.venv/bin/pip install -e . --no-deps --no-build-isolation`
Expected: successful install of `jupyter-geoagent 0.1.0`.

- [ ] **Step 3: Restart the running JupyterLab**

The user has a JupyterLab process running at PID visible via `ps aux | grep jupyter-lab`. Ask the user to restart it (Ctrl-C in its terminal and re-run their launch command). Do not kill the process on their behalf.

Expected: a fresh JupyterLab session that loads the rebuilt `@boettiger-lab/jupyter-geoagent` bundle.

---

### Task 8: Manual verification through @OpenCode

**Files:** (none — runs the chat UI)

- [ ] **Step 1: Open a GeoAgent Map panel**

In JupyterLab, click **GeoAgent Map** in the launcher. Wait for the map to load.

- [ ] **Step 2: Ask @OpenCode to list the new commands**

In a jupyter-ai chat, send:

```
@OpenCode use list_all_commands to find every command whose id starts with "geoagent:". Show the list.
```

Expected: OpenCode calls `list_all_commands(query="geoagent:")` and returns 10+ entries, including `geoagent:open`, `geoagent:show_layer`, `geoagent:hide_layer`, `geoagent:set_filter`, `geoagent:clear_filter`, `geoagent:reset_filter`, `geoagent:set_style`, `geoagent:reset_style`, `geoagent:fly_to`, `geoagent:filter_by_query`, `geoagent:get_map_state`. Each should carry an `args` JSON-Schema and a caption.

- [ ] **Step 3: Add a layer via the UI, then ask @OpenCode for state**

Add one layer from the catalog (e.g. *Irrecoverable Carbon*). Then:

```
@OpenCode call execute_command("geoagent:get_map_state", {}). Summarize the layers.
```

Expected: one layer listed, with its id, `visible: true`, type, and current filter.

- [ ] **Step 4: Ask @OpenCode to hide then show the layer**

```
@OpenCode hide the layer you just saw, then show it again. Use the geoagent commands.
```

Expected: OpenCode calls `execute_command("geoagent:hide_layer", {layer_id: "..."})`, then `execute_command("geoagent:show_layer", {layer_id: "..."})`. The map visually hides and re-shows the layer; the Layers tab checkbox updates accordingly.

- [ ] **Step 5: Ask @OpenCode for a SQL-driven filter**

```
@OpenCode filter the active layer to features where <some_property> = <some_value>, using the filter_by_query command.
```

Expected: OpenCode constructs a SQL query, calls `geoagent:filter_by_query`, and the map reflects the filtered features. The Layers tab shows the filter.

- [ ] **Step 6: Verify the ToolCallRecorder captures LLM-driven calls**

Switch to the **Export** tab, click **Export Tool Call Log**. Open the downloaded JSON.

Expected: entries for each LLM-driven command (`show_layer`, `hide_layer`, `filter_by_query`, etc.) with timestamps, args, and stringified results.

---

### Task 9: Push branch and open PR

**Files:** (none)

- [ ] **Step 1: Push the branch**

Run: `git push -u origin feat/jupyter-ai-command-bridge`

- [ ] **Step 2: Open PR via `gh pr create`**

```bash
gh pr create --title "Expose map tools as JupyterLab commands for jupyter-ai" --body "$(cat <<'EOF'
## Summary

- Register each geo-agent map tool as a JupyterLab command (`geoagent:show_layer`, `geoagent:set_filter`, etc.) with `describedBy.args` so jupyter-ai personas (OpenCode, Claude, Goose) can drive the map via chat.
- Add `MapManagerAdapter` bridging `MapViewController` to the `MapManager` contract expected by `createMapTools` — same tool descriptions and behavior as the standalone geo-agent web app, no duplication.
- Add `active-panel` registry so commands target whichever panel is currently mounted; panel updates this ref on mount and clears it on unmount.

Skipped for follow-up: `list_datasets` / `get_dataset_details` (jupyter-geoagent uses MCP-backed catalog, not `DatasetCatalog`); `set_projection` (needs globe/mercator toggle in `MapViewController`).

## Test plan

- [ ] `@OpenCode use list_all_commands to find commands matching "geoagent:"` returns 10+ tool entries with JSON schemas
- [ ] `@OpenCode call execute_command("geoagent:get_map_state", {})` returns current layers + view
- [ ] `@OpenCode hide layer X / show layer X` drives the map; UI checkbox reflects state
- [ ] `@OpenCode filter layer X by <some SQL>` via `geoagent:filter_by_query` applies a visible filter
- [ ] Export tool-call log captures LLM-driven calls alongside GUI-driven ones
EOF
)"
```

Expected: PR URL printed.

---

## Self-review checklist

Run through this before marking the plan complete:

1. **Spec coverage.** The spec was: expose map tools as JupyterLab commands. All 10 non-skipped tools are registered (Task 4). `describedBy.args` is set (Task 4). Active panel is tracked so commands can find their target (Tasks 2, 6). Registration is wired into plugin activate (Task 5). Verified via chat (Task 8).

2. **Placeholders.** None — every code step contains final code.

3. **Type consistency.** `MapManagerAdapter` → used with `as any` cast in `commands.ts` (geo-agent types are `any`, intentional). `ActivePanel` interface fields (`controller`, `mcpClient`, `recorder`, `refresh`) match what `GeoAgentApp` supplies in Task 6. Command IDs spelled `geoagent:<tool_name>` consistently in Task 4 and Task 8.

---

## Execution handoff

**Which approach?**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with review between them.
2. **Inline Execution** — run tasks sequentially in this session with checkpoints after Tasks 3, 6, and 7.
