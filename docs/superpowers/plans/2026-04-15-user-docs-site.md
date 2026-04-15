# User Documentation Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a layered user guide (quickstart + common patterns) as a MyST static HTML site under `docs/`, deployed to GitHub Pages on every push to `main`.

**Architecture:** A MyST (`mystmd`) project rooted at `docs/`, with source as plain `.md` so files still render on GitHub. A GitHub Actions workflow builds with `myst build --html` and deploys via `actions/deploy-pages`. The single `docs/usage.md` file holds both the quickstart walkthrough and the named how-to patterns. The existing `docs/design.md` joins the site TOC as an internal reference with a short explanatory note.

**Tech Stack:** MyST (`mystmd` CLI, Node-based), GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-04-15-user-docs-site-design.md`

---

## File Structure

Files created or modified by this plan:

- **Create** `docs/myst.yml` — MyST project config (title, TOC, exclusions)
- **Create** `docs/index.md` — landing page with project intro and nav
- **Create** `docs/usage.md` — the end-user guide (quickstart + patterns)
- **Modify** `docs/design.md:1-4` — add a short note marking it as an internal architecture reference
- **Modify** `.gitignore` — add `docs/_build/` to keep MyST build output out of git
- **Create** `.github/workflows/docs.yml` — build-and-deploy workflow
- **Modify** `README.md:35-37` — add a link to the published user guide alongside the existing design link

Each task below produces one self-contained commit.

---

## Prerequisites

The engineer executing this plan needs:

- Node 18+ and `npm` on `PATH` (check with `node --version && npm --version`)
- Install `mystmd` globally once, at the top of the work:

  ```bash
  npm install -g mystmd
  myst --version
  ```

  Expected: prints a version number without error. If the install fails due to permissions, use `npm install -g --prefix ~/.npm-global mystmd` and add `~/.npm-global/bin` to `PATH`.

- Ability to open a local HTML file in a browser (or use `myst start` for live preview).

---

## Task 1: MyST project scaffold + local build works

Goal: prove the build pipeline works end-to-end with a minimal landing page before we write real content.

**Files:**
- Create: `docs/myst.yml`
- Create: `docs/index.md`
- Modify: `.gitignore`

- [ ] **Step 1.1: Add build output to .gitignore**

Open `.gitignore` and append the following line at the end (keep the existing content):

```
docs/_build/
```

- [ ] **Step 1.2: Create `docs/myst.yml`**

Write this exact content:

```yaml
version: 1
project:
  title: jupyter-geoagent
  description: Interactive geospatial data exploration in JupyterLab
  github: https://github.com/boettiger-lab/jupyter-geoagent
  toc:
    - file: index.md
    - file: usage.md
    - file: design.md
  exclude:
    - superpowers/**
    - _build/**
site:
  template: book-theme
```

Note: the TOC references `usage.md` which does not yet exist. MyST will warn but still build `index.md`. We create `usage.md` in Task 2.

- [ ] **Step 1.3: Create a minimal `docs/index.md`**

Write this exact content:

```markdown
# jupyter-geoagent

A JupyterLab extension for interactive geospatial data exploration: browse STAC catalogs, add layers to a map, style and filter them, run SQL queries via MCP, and export reproducible artifacts — all without writing code.

## Where to go next

- **[Usage Guide](usage.md)** — how to use the extension day-to-day, with a quickstart and common patterns
- **[Design Specification](design.md)** — architecture, module reuse, data flow (internal reference for contributors)

## Install

```bash
pip install jupyter-geoagent
```

See the project [README on GitHub](https://github.com/boettiger-lab/jupyter-geoagent) for development setup.
```

- [ ] **Step 1.4: Build the site locally**

Run from the repo root:

```bash
cd docs && myst build --html
```

Expected output: MyST prints a build summary with a path like `_build/html/`. It may warn about `usage.md` not existing yet — that is expected. Build should not fail.

- [ ] **Step 1.5: Verify the output renders**

Run:

```bash
ls docs/_build/html/
```

Expected: `index.html` (and possibly `design.html`) exist. Open `docs/_build/html/index.html` in a browser (or run `myst start` from `docs/` for live preview on `http://localhost:3000`) and confirm the landing page renders with the project title and the two nav links.

Confirm that NO files under `docs/superpowers/` appear in the HTML output (the `exclude` rule should have kept them out). If you see superpowers content, stop and check `myst --help` / https://mystmd.org for the current exclusion key name, adjust `myst.yml`, rebuild.

- [ ] **Step 1.6: Commit**

```bash
git add .gitignore docs/myst.yml docs/index.md
git commit -m "Add MyST docs scaffold with landing page"
```

---

## Task 2: Write `docs/usage.md` — Quickstart section

Goal: the linear happy-path walkthrough, committed as its own milestone.

**Files:**
- Create: `docs/usage.md`

- [ ] **Step 2.1: Create `docs/usage.md` with the full Quickstart content**

Write this exact content:

````markdown
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
````

- [ ] **Step 2.2: Rebuild and verify**

Run:

```bash
cd docs && myst build --html
```

Expected: build succeeds with no warnings about `usage.md`. Open `docs/_build/html/usage.html` in a browser (or use `myst start`) and confirm the page renders with the section headings "Quickstart", "1. Open the GeoAgent panel", …, "6. Export a shareable map".

- [ ] **Step 2.3: Commit**

```bash
git add docs/usage.md
git commit -m "Add user guide quickstart"
```

---

## Task 3: Add Common Patterns section to `docs/usage.md`

Goal: the named how-tos that cover concrete user tasks, appended to the same file.

**Files:**
- Modify: `docs/usage.md`

- [ ] **Step 3.1: Append the Common Patterns section**

Append the following content to the end of `docs/usage.md` (after the Quickstart section):

````markdown

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
4. Scroll the result table

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
````

- [ ] **Step 3.2: Rebuild and verify**

Run:

```bash
cd docs && myst build --html
```

Expected: build succeeds. Open `docs/_build/html/usage.html` and confirm the "Common Patterns" section and all 8 sub-sections render with correct headings and numbered lists.

- [ ] **Step 3.3: Commit**

```bash
git add docs/usage.md
git commit -m "Add common-patterns how-tos to user guide"
```

---

## Task 4: Mark `docs/design.md` as an internal reference

Goal: when readers land on the design page from the site sidebar, they know what they are looking at.

**Files:**
- Modify: `docs/design.md:1-4`

- [ ] **Step 4.1: Prepend a context note to `docs/design.md`**

The current file starts with:

```markdown
# jupyter-geoagent: Design Specification

**Date:** 2026-04-14
**Repo:** `boettiger-lab/jupyter-geoagent`
```

Edit it to become:

```markdown
# jupyter-geoagent: Design Specification

**Date:** 2026-04-14
**Repo:** `boettiger-lab/jupyter-geoagent`

:::{note}
This is an internal architecture reference for contributors. If you are looking for how to use the extension, see the [Usage Guide](usage.md) instead.
:::
```

The `:::{note}` block is MyST's admonition syntax; on GitHub it renders as plain text in a fenced block, and in the HTML site it becomes a styled callout.

- [ ] **Step 4.2: Rebuild and verify**

Run:

```bash
cd docs && myst build --html
```

Expected: build succeeds. Open `docs/_build/html/design.html` and confirm the note callout renders at the top with a working link to `usage.html`.

- [ ] **Step 4.3: Commit**

```bash
git add docs/design.md
git commit -m "Mark design spec as internal reference in docs site"
```

---

## Task 5: GitHub Actions deploy workflow

Goal: every push to `main` that touches `docs/` rebuilds and publishes the site to GitHub Pages.

**Files:**
- Create: `.github/workflows/docs.yml`

- [ ] **Step 5.1: Create the workflow directory**

Run:

```bash
mkdir -p .github/workflows
```

- [ ] **Step 5.2: Create `.github/workflows/docs.yml`**

Write this exact content:

```yaml
name: Docs

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - '.github/workflows/docs.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install mystmd
        run: npm install -g mystmd

      - name: Build site
        run: |
          cd docs
          myst build --html

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/_build/html

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 5.3: Lint the YAML locally**

If `yamllint` is available, run:

```bash
yamllint .github/workflows/docs.yml
```

If not, at minimum check the file parses as valid YAML:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/docs.yml'))"
```

Expected: no errors.

- [ ] **Step 5.4: Commit**

```bash
git add .github/workflows/docs.yml
git commit -m "Add GitHub Pages deploy workflow for docs"
```

- [ ] **Step 5.5: Note manual repo setup (do not automate — document only)**

This workflow cannot enable Pages by itself. After the plan is merged, a repo admin must:

1. Go to `https://github.com/boettiger-lab/jupyter-geoagent/settings/pages`
2. Under **Build and deployment → Source**, select **GitHub Actions**
3. Trigger the workflow (push a docs change, or run it from the Actions tab via `workflow_dispatch`)
4. The first successful deploy will publish at `https://boettiger-lab.github.io/jupyter-geoagent/` — record the actual URL (MyST's page paths may be `usage/` or `usage.html` depending on theme)

Do not add this as a step the engineer executes; surface it in the final summary instead.

---

## Task 6: README pointer to the user guide

Goal: readers arriving at the GitHub repo see a pointer to the user guide, not just to the design spec.

**Files:**
- Modify: `README.md:35-37`

- [ ] **Step 6.1: Read the current README architecture section**

The current README ends with:

```markdown
## Architecture

See [docs/design.md](docs/design.md) for the full design specification.
```

- [ ] **Step 6.2: Expand the section to cover both guides**

Replace the section above with:

```markdown
## Documentation

- **User guide:** how to use the extension day-to-day. Published at https://boettiger-lab.github.io/jupyter-geoagent/ (once GitHub Pages is configured) or read the source at [docs/usage.md](docs/usage.md).
- **Design specification:** architecture and module reuse reference for contributors at [docs/design.md](docs/design.md).
```

The published URL is accurate once Pages is configured. Until then, the markdown link to `docs/usage.md` works fine on GitHub.

- [ ] **Step 6.3: Commit**

```bash
git add README.md
git commit -m "Point README at user guide alongside design spec"
```

---

## Post-implementation verification

After all six tasks are complete:

- [ ] **Step V.1: Clean-build the full site**

```bash
rm -rf docs/_build
cd docs && myst build --html
```

Expected: a clean build with no warnings. Files in `docs/_build/html/` should include at minimum `index.html`, `usage.html` (or `usage/index.html`), and `design.html` (or `design/index.html`).

- [ ] **Step V.2: Browse the whole site locally**

Run:

```bash
cd docs && myst start
```

Open the printed URL (usually `http://localhost:3000`) and:

1. Land on the home page; confirm both nav links work
2. Click through to **Usage Guide**; confirm quickstart and all 8 patterns render
3. Click through to **Design Specification**; confirm the note callout at the top links back to the user guide and resolves correctly
4. Check the sidebar navigation includes all three pages and nothing from `superpowers/`

- [ ] **Step V.3: Verify the workflow on GitHub**

After pushing to `main`:

1. Watch the **Docs** workflow run in the Actions tab
2. Confirm both `build` and `deploy` jobs succeed
3. The deploy job's summary includes the Pages URL
4. Visit that URL in a browser and re-check the three-page navigation

If the deploy job fails with "Pages site not found" or similar, perform the manual repo setup from Task 5.5 and re-run the workflow via `workflow_dispatch`.

---

## Final summary to report to the user

After verification passes, report:

- Link to each of the 6 commits on `main`
- The published Pages URL (once the first deploy succeeds)
- A reminder that enabling Pages under repo **Settings → Pages → Source = GitHub Actions** is a one-time manual step the workflow cannot perform
