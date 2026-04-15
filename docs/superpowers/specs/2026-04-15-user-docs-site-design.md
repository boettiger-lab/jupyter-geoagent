---
name: User documentation site
description: Layered usage guide (quickstart + common patterns) published as a MyST static HTML site alongside the existing design spec
type: project
---

# User Documentation Site: Design Spec

**Date:** 2026-04-15
**Repo:** `boettiger-lab/jupyter-geoagent`
**Audience:** end users (researchers using the GeoAgent Map panel in JupyterLab)

## Problem

`README.md` covers install and a one-line pitch. `docs/design.md` covers architecture for contributors. Nothing tells a researcher sitting in front of JupyterLab *how to use the thing* — what to click first, what the panels do, how to filter a layer, how to share a map. Users currently have to read the source or the design spec.

## Goals

1. A user-facing guide that answers "I just opened GeoAgent Map — now what?" and "how do I do X?"
2. Published as a static HTML site so it has a sidebar, search, and a stable URL.
3. Source stays as plain markdown so GitHub still renders it and we're not locked into any tool.
4. Low maintenance cost — one file to keep in sync with the UI as it evolves.

## Non-goals

- No developer / API reference (separate effort, not needed yet).
- No screenshots in v1 — the UI is still changing and images go stale fast.
- No executable content / notebook cells — not needed for a user guide.
- No custom theme.

## Solution overview

A MyST (`mystmd`) static site rooted at `docs/`, built to HTML and deployed to GitHub Pages on every push to `main` that touches `docs/`.

The core content is a single `docs/usage.md` in two clearly labeled halves:

1. **Quickstart** — a ~2-minute linear walkthrough of the happy path.
2. **Common patterns** — named how-tos for specific tasks, 3–8 steps each.

The existing `docs/design.md` stays in place and joins the site TOC as an internal architecture reference.

## Why MyST

| Criterion | MyST | VitePress | Sphinx | Plain markdown |
|---|---|---|---|---|
| Jupyter-ecosystem fit | native | neutral | Python-side | neutral |
| Source portability (renders on GitHub) | yes | yes | partial (RST-ish) | yes |
| Setup weight | tiny | small | medium | zero |
| Out-of-box polish | good | excellent | good | none |

MyST wins on ecosystem fit and setup weight. VitePress has the most polished default UX but signals "JS project" rather than "Jupyter project." Sphinx is overkill for a user guide. Plain markdown has no sidebar / search.

## Site structure

```
docs/
├── myst.yml               # MyST project config
├── index.md               # landing page — intro + nav to Usage and Design
├── usage.md               # the end-user guide (quickstart + patterns)
├── design.md              # existing design spec, now in the TOC
└── superpowers/           # specs (this file lives here); excluded from the site build
```

`design.md` gets a short note at the top clarifying it is an internal architecture reference, so readers who land there from the sidebar know what they're looking at.

## `usage.md` content plan

### Part 1 — Quickstart

Linear walkthrough, six steps:

1. Open JupyterLab → click **GeoAgent Map** in the launcher (or `File > New > GeoAgent Map`)
2. The catalog browser in the left sidebar loads the default STAC catalog
3. Click **Add to Map** on a collection → the map recenters and the layer appears
4. Right sidebar → *Layers* tab: toggle visibility, adjust opacity, open **Set Style** or **Set Filter** to customize
5. *Query* tab: run SQL against a parquet asset via the MCP server; results appear as a table
6. *Export* tab: click **Export Static HTML Map** to download a standalone shareable file

### Part 2 — Common patterns

Each is a named how-to, 3–8 numbered steps. Grounded in tool-forms that actually exist today (`SetStyleForm`, `SetFilterForm`, `FilterByQueryForm`):

- **Switch catalogs** — change the URL in the catalog browser, reload
- **Style a vector layer** — open the layer, *Set Style*, pick fill / line / opacity
- **Filter a layer by a property** — *Set Filter*, choose property → operator → value
- **Filter a layer by a query result** — *Filter by Query*, write SQL returning an id list, apply as map filter
- **Run spatial and aggregation queries** — *Query* tab, select a parquet asset, view results
- **Share a map with a colleague** — export static HTML (self-contained, no server needed)
- **Hand off to a geo-agent web app** — export `layers-input.json`, pair with `geo-agent-template`
- **Reproduce a session** — export the tool-call log; note that full replay UI is future work

## MyST configuration

`docs/myst.yml`:

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
site:
  template: book-theme
```

(Theme and exact keys finalized against current `mystmd` docs when writing.)

## Deployment

`.github/workflows/docs.yml`:

- **Triggers:** push to `main` with paths `docs/**` or the workflow file itself, plus `workflow_dispatch`
- **Job:** checkout → setup Node → install `mystmd` → `cd docs && myst build --html` → publish `docs/_build/html/` to GitHub Pages
- **Deploy action:** the official `actions/deploy-pages` with `actions/upload-pages-artifact`, since it is the current recommended path and requires no extra token setup
- **Permissions:** `pages: write`, `id-token: write`, `contents: read`
- **One-time repo setup:** enable GitHub Pages in repo settings with source set to "GitHub Actions"

## Link from README

`README.md` gets one line added under the existing Architecture pointer, linking to both the published user guide on GitHub Pages and the markdown source at `docs/usage.md`. The exact Pages URL is confirmed after the first successful deploy (MyST's output path for the `usage` page depends on theme configuration).

## Risks and mitigations

- **MyST API churn.** `mystmd` is young. Mitigation: the source is plain markdown; if MyST breaks we swap the builder (VitePress, Sphinx) without rewriting content.
- **Docs drift from UI.** Single-file guide with no screenshots keeps the update cost small. Explicit "future work" labels on anything not yet fully built.
- **GitHub Pages setup is manual.** The workflow cannot enable Pages itself; that is a one-time click in repo settings, called out in the implementation plan.

## Out of scope for v1

- Screenshots, GIFs, video walkthroughs
- Developer / API reference site
- Per-tool form reference
- Executable MyST content
- Versioned docs (only latest `main` is published)
- Custom theme or branding
