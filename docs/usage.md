# Usage Guide

The GeoAgent Map panel in JupyterLab lets you browse STAC catalogs, add layers to an interactive map, style and filter them, query tabular data with SQL, and export reproducible artifacts — all without writing code.

This guide has two parts: a **Quickstart** walkthrough of the happy path, and a **Common Patterns** section with named how-tos you can jump to directly.

## Quickstart

From a fresh JupyterLab session to a shareable static map in about two minutes.

### 1. Open the GeoAgent panel

In the JupyterLab launcher, click **GeoAgent Map** (or choose `File > New > GeoAgent Map` from the menu). A new main-area panel opens with three regions:

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

- Toggle the checkbox to show or hide
- Click the **x** to remove
- With the layer selected, scroll the details pane:
  - **Vector layers** — *Set Style* (fill / line color, width, opacity) and *Set Filter* (property → operator → value)
  - **Raster layers** — opacity slider, colormap dropdown, rescale (min / max)

### 5. Run a SQL query

Switch to the *Query* tab. If the active layers include parquet assets and an MCP server is configured, you can run SQL directly against the data:

1. Write a query in the editor
2. Click **Run Query**
3. Results render as a table below the editor

### 6. Export a shareable map

Switch to the *Export* tab. Three buttons:

- **Export Static HTML Map** — downloads a self-contained `map-export.html` you can email, host anywhere, or open offline
- **Export layers-input.json** — the config format consumed by the `geo-agent-template` web app; use this to promote your exploration into a deployed LLM-chat map
- **Export Tool Call Log** — a JSON record of every action you took in this session; useful for reproducibility and debugging

The static HTML you just downloaded is a complete interactive map of your current view and layer state.
