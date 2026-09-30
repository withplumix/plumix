#!/usr/bin/env bash
# Installs mattpocock-skills from a clone at the commit mattpocock-skills.ref
# pins. Upstream's main ships without bumping the plugin's version, so
# `claude plugin update` never moves an install: the clone moves instead, and
# the plugin is reinstalled from it.
set -euo pipefail

clone="${1:?usage: install-mattpocock-skills.sh <clone directory>}"
ref="$(grep -v '^#' "$(dirname "$0")/mattpocock-skills.ref" | tr -d '[:space:]')"

git init -q "$clone"
if [ "$(git -C "$clone" rev-parse -q --verify HEAD || true)" != "$ref" ]; then
  git -C "$clone" fetch -q --depth 1 https://github.com/mattpocock/skills.git "$ref"
  git -C "$clone" checkout -q --detach FETCH_HEAD
fi

claude plugin marketplace remove mattpocock --scope user >/dev/null 2>&1 || true
claude plugin marketplace add "$clone" --scope user
claude plugin install mattpocock-skills@mattpocock --scope user
