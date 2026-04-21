# Usage Guide

The GeoAgent Map panel in JupyterLab lets you browse STAC catalogs, add layers to an interactive map, style and filter them, query tabular data with SQL, and export reproducible artifacts — all without writing code.

This guide has two parts: a **Quickstart** walkthrough of the happy path, and a **Common Patterns** section with named how-tos you can jump to directly.

## Quickstart

From a fresh JupyterLab session to a shareable map in about two minutes.

![GeoAgent Map panel showing the STAC catalog browser, interactive map, and layer controls](images/geoagent-panel.png)

### 1. Open the GeoAgent panel

In the JupyterLab launcher, click **GeoAgent Map**. A new main-area panel opens with three regions:

- **Left** — STAC catalog browser
- **Center** — interactive map
- **Right** — tabbed panel: *Layers*, *Query*, *Export*

### 2. Browse the default catalog

The left sidebar loads a default STAC catalog on open and shows a filterable list of collections. Type in the filter box to narrow by keyword.

Click **View** on any collection to open its asset detail view. You will see:

- A description and any sub-collections (click **View** to navigate into them)
- **Visual assets** (PMTiles vector, COG raster) — each has an **Add to Map** button and a type badge
- **Data assets** (Parquet) — shown for reference; not directly addable to the map
- A collapsible **Schema** section listing every `table:columns` entry with its type and, for categorical columns, all possible values as chips

Use the **← Back** button to return to the parent collection or the top-level list.

### 3. Add a layer to the map

Click **Add to Map** on a visual asset. The map recenters to the dataset's bounding box and the layer appears. The *Layers* tab auto-selects the new layer so its details pane is visible.

### 4. Adjust the layer

In the *Layers* tab:

- Click a layer row to select it — the details pane appears at the bottom
- Toggle the checkbox to show or hide
- Click the **x** to remove
- With a layer selected, the details pane shows:
  - **Vector layers** — *Set Style* (fill and line colors, width, fill opacity) and *Set Filter* (property → operator → value)
  - **Raster layers** — opacity slider, colormap dropdown, rescale (min / max)

The Schema section in the catalog browser is useful here: use the column names and enum value chips to construct filter and style expressions.

### 5. Run a SQL query

Switch to the *Query* tab. Queries run against a DuckDB MCP server.

1. Confirm the MCP server URL at the top of the tab (a default is pre-filled) and click **Connect**
2. Write a query in the editor (Ctrl+Enter also runs it)
3. Click **Run Query**
4. Results appear below the editor

### 6. Export

Switch to the *Export* tab. Four buttons:

- **Export Static HTML Map** — a self-contained `map-export.html` with all layer configs inlined; works offline for vector layers
- **Export layers-input.json** — the config consumed by geo-agent web apps; use this to promote your exploration into a deployed LLM-chat map
- **Export Tool Call Log** — a JSON record of every action in this session; useful for reproducibility and debugging
- **Export Standalone App** — downloads both `layers-input.json` **and** `index.html` together; place them in the same folder, serve over HTTP, and you have a full geo-agent web app without any additional setup

## Common Patterns

Each pattern is a self-contained how-to.

### Switch to a different STAC catalog

1. In the left sidebar, replace the URL in the catalog field with the new catalog URL
2. Click **Load**
3. The browser resets and shows the new catalog's collections

Previously added layers stay on the map — switching catalogs does not clear the map.

### Explore a collection's schema

When you open a collection's asset view (click **View**), scroll to the bottom and expand the **Schema** section. It lists every column with its type. Categorical columns show their allowed values as chips — these are exactly what you need to write filter and style expressions such as:

```json
["match", ["get", "GAP_Sts"], "1", "#26633A", "2", "#3E9C47", "#888888"]
```

### Style a vector layer

1. Add the vector asset from the catalog
2. In the *Layers* tab, click the layer to select it
3. Scroll to the **Style** form in the details pane
4. Edit the JSON object (MapLibre paint properties — e.g. `{"fill-color": "#2E7D32", "fill-opacity": 0.5}`)
5. Click **Apply** to push the change to the map; **Reset to default** restores the layer's original style

Use the Schema section to find valid column names and values for data-driven styles.

### Filter a vector layer by a property

The filter is authored as a [MapLibre filter expression](https://maplibre.org/maplibre-style-spec/expressions/) in JSON form.

1. Select the layer in the *Layers* tab
2. Scroll to the **Filter** form in the details pane
3. Edit the JSON textarea — e.g. `["==", ["get", "MNG_AGENCY"], "State Parks"]` or `["match", ["get", "GAP_Sts"], ["1", "2"], true, false]`
4. Click **Apply**
5. The map updates immediately; only features matching the filter render

Use **Clear** to remove the filter, or **Reset to default** to restore the layer's original filter.

### Filter a vector layer by a query result

When a simple property filter isn't enough — for example, features whose id appears in the result of an aggregate — use **Filter by SQL query**:

1. Select the layer in the *Layers* tab
2. Scroll to the **Filter by SQL query** form (only rendered for vector layers when an MCP server is connected)
3. Write a `SELECT` that returns a single column of id values — e.g. `SELECT HYBAS_ID FROM read_parquet('s3://…') WHERE UP_AREA > 50000`
4. Enter the **ID property** on the layer to match against (typically `_cng_fid` for cng-datasets)
5. Click **Apply**

### Run spatial and aggregation queries

1. Switch to the *Query* tab and click **Connect** if not already connected
2. Write a query against a parquet asset (visible in layer details, or from the STAC catalog schema)
3. Click **Run Query** (or Ctrl+Enter)

Queries run through the configured MCP server (DuckDB by default). Spatial functions (`ST_Intersects`, `ST_Area`, etc.) are available if the server has the DuckDB spatial extension loaded.

### Share a map with a colleague

1. Compose your map: add layers, style, filter, pan and zoom to the view you want
2. *Export* tab → **Export Static HTML Map**
3. Send the downloaded `map-export.html` file

The file loads MapLibre GL JS and PMTiles from CDN. It works offline for vector layers; raster layers need network access for the tile server.

### Deploy a standalone geo-agent web app

To go from your exploration to a full geo-agent web app (with LLM chat) in one step:

1. *Export* tab → **Export Standalone App**
2. Two files download: `layers-input.json` and `index.html`
3. Place them in the same directory and serve over HTTP (e.g. `python -m http.server`)
4. The app loads geo-agent from CDN, reads `layers-input.json`, and presents a full LLM-chat map

Alternatively, use **Export layers-input.json** alone and drop it into a [`geo-agent-template`](https://github.com/boettiger-lab/geo-agent-template) clone.

### Use the AI chat panel (jupyter-ai)

jupyter-geoagent ships with jupyter-ai v3 and a pre-configured Claude persona that has access to the duckdb-geo MCP server. This lets you ask questions about catalog data and get answers written directly into notebooks, without leaving JupyterLab.

**Setup (one time):**

1. Ensure `~/.jupyter/mcp_settings.json` exists with the duckdb-geo server:
   ```json
   {
     "mcp_servers": [
       { "type": "http", "name": "duckdb-geo",
         "url": "https://dev-duckdb-mcp.nrp-nautilus.io/mcp" }
     ]
   }
   ```
2. Install the Claude ACP adapter: `npm install -g @zed-industries/claude-agent-acp --prefix ~/.local`
3. Restart JupyterLab

**To chat:**

1. Click the chat bubble icon in the JupyterLab left sidebar
2. Click **+** to open a new chat
3. Select the **Claude** persona
4. Ask questions — the agent has access to duckdb-geo tools (`query`, `get_collection`, etc.) and can read/write notebooks

### Reproduce a session

1. *Export* tab → **Export Tool Call Log**
2. The resulting `tool-calls.json` records every action (with arguments and timestamps) in order

A full replay UI is planned but not yet built. The log is useful for sharing a precise bug report, auditing what was done, or manually re-tracing steps.
