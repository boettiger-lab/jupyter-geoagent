#!/bin/bash
# Drop the geoagent agent-instruction files into $HOME on container start.
#
# AGENTS.md is the source of truth (vendor-neutral; honored by Claude Code,
# OpenCode, Codex, Cursor, and other modern agent clients). CLAUDE.md is a
# one-liner that includes AGENTS.md via Claude Code's `@filename` syntax —
# kept for older Claude Code versions and to make the discovery path obvious.
#
# Runs from the docker-stacks `before-notebook.d` hook, after the user-home
# volume (e.g. a JupyterHub PVC) has been mounted. We can't bake these into
# $HOME directly because that path is overlaid by the mount; the system path
# /usr/local/share/jupyter-geoagent is not.
#
# Skipped per-file if the user already has the corresponding file so we
# never clobber per-user customizations.
set -e

SRC_DIR=/usr/local/share/jupyter-geoagent

for name in AGENTS.md CLAUDE.md; do
    if [ ! -f "$HOME/$name" ] && [ -f "$SRC_DIR/$name" ]; then
        cp "$SRC_DIR/$name" "$HOME/$name"
    fi
done
