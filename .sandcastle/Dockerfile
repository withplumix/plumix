FROM node:24-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Playwright's chromium system libraries. They need root and apt, so they are
# baked in; the browser binaries themselves are downloaded per-run into a
# host-mounted cache, keyed by the version the repo's catalog resolves to.
RUN npx --yes playwright@1.62.1 install-deps chromium \
  && rm -rf /var/lib/apt/lists/*

# Build-args for UID/GID alignment: sandcastle docker build-image
# defaults these to the host user's UID/GID so image-built files
# and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Rename the base image's "node" user to "agent" and align UID/GID.
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:/home/agent/.pnpm-bin:$PATH"

# pnpm, pinned to the version the repo's packageManager field declares.
# The store lives outside the worktree so a bind-mounted host cache can back it.
ENV PNPM_HOME="/home/agent/.pnpm-bin"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN mkdir -p /home/agent/.pnpm-bin \
  && corepack enable --install-directory /home/agent/.pnpm-bin \
  && corepack prepare pnpm@10.33.0 --activate \
  && pnpm config set store-dir /home/agent/.pnpm-store

# The plugin skills /ship composes (sentry-skills, mattpocock-skills). The repo's
# .claude/settings.json only declares them; a fresh container has no plugin cache,
# and a headless run cannot answer the install prompt.
RUN claude plugin marketplace add getsentry/skills --scope user \
  && claude plugin marketplace add mattpocock/skills --scope user \
  && claude plugin install sentry-skills@sentry-skills --scope user -y \
  && claude plugin install mattpocock-skills@mattpocock --scope user -y

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
