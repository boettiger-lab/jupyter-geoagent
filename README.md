# jupyter-geoagent

A JupyterLab extension for interactive geospatial data exploration via STAC catalogs and MCP-powered queries.

Click **GeoAgent Map** in the JupyterLab launcher to open a GUI-driven map explorer — no code required. Browse STAC catalogs, add layers, style and filter data, run DuckDB spatial queries, and export reproducible artifacts.

## Features

- **STAC catalog browser** — enter a catalog URL, browse collections, add layers to the map
- **MapLibre GL JS map** — interactive map with multiple basemaps, zoom, pan, rotate
- **Layer management** — toggle visibility, remove layers
- **MCP query interface** — run SQL queries against parquet data via a remote DuckDB server
- **Reproducible exports** — export as static HTML map, geo-agent `layers-input.json`, or a tool call log

## Install

```bash
pip install jupyter-geoagent
```

## Development

```bash
# Clone and install in dev mode
pip install -e ".[dev]"

# Link the extension for development
jupyter labextension develop --overwrite .

# Watch for changes (in two terminals)
jlpm watch:src
jupyter lab --no-browser
```

## Architecture

See [docs/design.md](docs/design.md) for the full design specification.
