# Minimal JupyterHub single-user image with jupyter-geoagent and
# jupyter-ai (Claude + OpenCode ACP personas) pre-installed.
#
# Base: quay.io/jupyter/minimal-notebook — Ubuntu-based Jupyter Server
# with Python, JupyterLab 4, git/curl/bash utilities, NB_USER=jovyan,
# NB_UID=1000. Intended for JupyterHub single-user pods.
FROM quay.io/jupyter/minimal-notebook:latest

USER root

# Node.js + npm are required for the @zed-industries/claude-agent-acp
# bridge that jupyter-ai spawns when the user @mentions @Claude.
RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs npm && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Claude Code CLI. The installer drops a versioned binary tree under
# $HOME/.local/share/claude/versions/<ver>/ and a symlink at
# $HOME/.local/bin/claude pointing to it. For a system-wide install
# that survives JupyterHub home-volume mounts, move the whole tree to
# /opt/claude and retarget the /usr/local/bin/claude symlink.
RUN curl -fsSL https://claude.ai/install.sh | bash && \
    CLAUDE_TARGET="$(readlink "$HOME/.local/bin/claude")" && \
    mv "$HOME/.local/share/claude" /opt/claude && \
    ln -sf "${CLAUDE_TARGET/$HOME\/.local\/share\/claude/\/opt\/claude}" /usr/local/bin/claude && \
    rm -rf "$HOME/.local"

# OpenCode CLI — used by the jupyter-ai OpenCode persona.
RUN curl -fsSL https://opencode.ai/install | bash && \
    mv "$HOME/.opencode/bin/opencode" /usr/local/bin/opencode && \
    rm -rf "$HOME/.opencode"

# Claude ACP bridge — installs a `claude-agent-acp` binary onto PATH.
RUN npm install -g @zed-industries/claude-agent-acp && \
    npm cache clean --force

# jupyter-ai v3 transitively pulls jupyter-ai-acp-client,
# jupyter-ai-chat-commands, and jupyter-ai-persona-manager, which
# register the Claude / OpenCode / Goose personas automatically.
# jupyter-geoagent registers the GeoAgent Map launcher tile plus
# `geoagent:*` JupyterLab commands so the LLM personas can drive the
# map directly from chat.
RUN pip install --no-cache-dir \
      "jupyter-ai>=3,<4" \
      "jupyter-geoagent @ git+https://github.com/boettiger-lab/jupyter-geoagent.git@main"

USER ${NB_UID}
