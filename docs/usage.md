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

## Common Patterns

Each pattern is a self-contained how-to.

### Switch to a different STAC catalog

1. In the left sidebar, replace the URL in the catalog field with the new catalog URL
2. Click **Load**
3. The browser resets and shows the new catalog's collections

Previously added layers stay on the map — switching catalogs does not clear the map.

### Style a vector layer

1. Add the vector dataset from the catalog
2. In the *Layers* tab, click the layer to select it
3. Expand **Set Style** in the details pane
4. Edit any supported keys (fill color, line width, fill opacity, etc.)
5. Changes apply live to the map

Style changes are recorded in the tool-call log as `set_style` calls.

### Filter a vector layer by a property

1. Select the layer in the *Layers* tab
2. Expand **Set Filter** in the details pane
3. Choose the property from the dropdown (populated from the layer's schema)
4. Pick an operator (`==`, `!=`, `>`, `<`, `in`, etc.)
5. Enter the value
6. The map updates immediately; only features matching the filter render

To clear, open **Set Filter** again and submit an empty filter.

### Filter a vector layer by a query result

When a simple property filter isn't enough — for example, you want features whose id appears in the result of an aggregate — use **Filter by Query**:

1. Select the layer in the *Layers* tab
2. Expand **Filter by Query** (only shown for vector layers when an MCP server is configured)
3. Write SQL that returns an id list (the column matching the layer's id field)
4. Submit — the results are pushed to the map as a filter of the form `["in", ["get", "<id_field>"], ...values]`

### Run spatial and aggregation queries

1. Switch to the *Query* tab
2. Write a query against a parquet asset (visible in the layer details, or from the STAC catalog)
3. Click **Run Query**
4. Scroll the result output

Queries run through the configured MCP server (a DuckDB server by default). Spatial functions (`ST_Intersects`, `ST_Area`, etc.) are available if the server has the DuckDB spatial extension loaded.

### Share a map with a colleague

1. Compose your map: add layers, style, filter, pan and zoom to the view you want
2. *Export* tab → **Export Static HTML Map**
3. Send the downloaded `map-export.html` file

The file inlines MapLibre GL JS and PMTiles from CDN, plus all your layer configs and the current view. It works offline for vector layers; raster layers need network access for the tile server.

### Hand off to a geo-agent web app deployment

When you want an LLM-chat map on top of the exploration you just built:

1. *Export* tab → **Export layers-input.json**
2. Clone the [`geo-agent-template`](https://github.com/boettiger-lab/geo-agent-template) repo
3. Replace its `layers-input.json` with the file you just exported
4. Follow that repo's deploy instructions

### Reproduce a session

1. *Export* tab → **Export Tool Call Log**
2. The resulting `tool-calls.json` has every action (with arguments and timestamps) you performed in order

A full replay UI — loading the log and re-executing calls inside the panel — is planned but not yet built. For now, the log is useful for: sharing a precise bug report, auditing what was done, or manually re-tracing steps.
