# Usage Guide

The GeoAgent Map panel in JupyterLab lets you browse STAC catalogs, add layers to an interactive map, style and filter them, query tabular data with SQL, and export reproducible artifacts — all without writing code.

This guide has two parts: a **Quickstart** walkthrough of the happy path, and a **Common Patterns** section with named how-tos you can jump to directly.

## Quickstart

From a fresh JupyterLab session to a shareable static map in about two minutes.

### 1. Open the GeoAgent panel

In the JupyterLab launcher, click **GeoAgent Map**. A new main-area panel opens with three regions:

- **Left** — STAC catalog browser
- **Center** — interactive map
- **Right** — tabbed panel: *Layers*, *Query*, *Export*

### 2. Browse the default catalog

The left sidebar loads a default STAC catalog on open. Each entry shows a title and a short description. Nested catalogs have an expand arrow on the left; leaf collections have an **Add** button on the right.

Type in the filter box to narrow the list by keyword (matches title, description, or id — including nested entries).

### 3. Add a layer to the map

Click **Add** on any leaf collection. The map recenters to the dataset's bounding box and the layer appears. The *Layers* tab (right sidebar) auto-selects the new layer so its details pane is visible at the bottom.

### 4. Adjust the layer

In the *Layers* tab:

- Click a layer row to select it — the details pane appears at the bottom
- Toggle the checkbox to show or hide
- Click the **x** to remove
- With a layer selected, the details pane shows:
  - **Vector layers** — *Set Style* (fill and line colors, width, fill opacity) and *Set Filter* (property → operator → value)
  - **Raster layers** — opacity slider, colormap dropdown, rescale (min / max)

### 5. Run a SQL query

Switch to the *Query* tab. Queries run against a DuckDB MCP server.

1. Confirm the MCP server URL at the top of the tab (a default is pre-filled) and click **Connect**
2. Write a query in the editor (Ctrl+Enter also runs it)
3. Click **Run Query**
4. Results appear below the editor

If you see the message "Enter an MCP server URL and click Connect," the server is not yet connected — update the URL if needed and click Connect.

### 6. Export a shareable map

Switch to the *Export* tab. Three buttons:

- **Export Static HTML Map** — downloads a self-contained `map-export.html` you can email, host anywhere, or open offline
- **Export layers-input.json** — the config format consumed by the `geo-agent-template` web app; use this to promote your exploration into a deployed LLM-chat map
- **Export Tool Call Log** — a JSON record of every action you took in this session; useful for reproducibility and debugging
