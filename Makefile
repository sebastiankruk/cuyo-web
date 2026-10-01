# Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.
#
# Thin wrapper over the npm scripts. Every target here runs exactly one command,
# so there is no second definition of what "lint" means and the npm scripts stay
# usable without make. What the Makefile adds is the AI mode.
#
# See the "AiOps Environment Mode Directive" in .agents/rules/cuyo-standards.md.
.PHONY: help init dev dev-lan check lint lint-code lint-types lint-docs \
        lint-specs lint-shell check-art corpus test test-engine build \
        preview preview-host clean distclean

SHELL := /bin/bash

# Detect node/npm/npx, working from shells that have not sourced nvm - IDE
# terminals, cron, CI. Prepending the binary's own directory to PATH keeps
# `#!/usr/bin/env node` shebangs in npm/npx wrappers resolvable.
NODE     := $(shell command -v node 2>/dev/null || ls $(HOME)/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)
NODE_DIR := $(dir $(NODE))

ifeq ($(NODE),)
  NPM = npm
  NPX = npx
else
  NPM = PATH="$(NODE_DIR):$$PATH" $(NODE_DIR)npm
  NPX = PATH="$(NODE_DIR):$$PATH" $(NODE_DIR)npx
endif

# Terser output for agents.
#
# `AI_ECHO` is `@:` in AI mode and `@echo` otherwise, so every recipe can write
# `$(AI_ECHO) "Running eslint..."` and the banner disappears without the target
# having to know which mode it is in. Same trick as iqoqo's.
#
# On the full suite this is the whole of the saving for `make test`: 485 bytes
# with banners against 406 without. Nothing here is allowed to change what the
# commands do, only what they print - a terse failure that hides the failing
# assertion would cost far more than the tokens it saves.
ifeq ($(CUYO_AI_MODE),1)
  ESLINT_FLAGS ?= --no-warn-ignored
  TSC_FLAGS    ?= --pretty false
  # `--loglevel=error` drops npm's "npm notice run ..." preamble, which is two
  # lines per invocation and says nothing.
  NPX_FLAGS    ?= --loglevel=error
  NPM_INSTALL  ?= --no-audit --no-fund --loglevel=error
  NPM_RUN      ?= --loglevel=error
  # `--logLevel warn` drops vite's success chatter - the module count, the per-file
  # gzip sizes, the elapsed time - which is eleven lines that never change. Build
  # errors are printed at error level and still show, with their stack: verified by
  # breaking the bundle graph and confirming the message survives.
  BUILD_TARGET ?= build:terse
  AI_ECHO      := @:
else
  ESLINT_FLAGS ?=
  TSC_FLAGS    ?=
  NPX_FLAGS    ?=
  NPM_INSTALL  ?=
  NPM_RUN      ?=
  BUILD_TARGET ?= build
  AI_ECHO      := @echo
endif

help:
	@echo "cuyo-web"
	@echo ""
	@echo "  make init         - Install dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Dev server (all interfaces)"
	@echo "  make dev-lan      - Dev server reachable from a phone on the LAN"
	@echo ""
	@echo "Code quality:"
	@echo "  make lint         - Everything CI runs: code, types, docs, specs"
	@echo "  make lint-code    - ESLint, including the engine/ boundary rule"
	@echo "  make lint-types   - tsc --noEmit"
	@echo "  make lint-docs    - markdownlint-cli2 over the hand-written docs"
	@echo "  make lint-specs   - openspec validate --strict over the change"
	@echo "  make lint-shell   - shellcheck over scripts/"
	@echo "  make check-art    - Assert no upstream artwork reached dist/"
	@echo "  make corpus       - Fetch the upstream Cuyo tree the corpus tests read"
	@echo ""
	@echo "Testing and building:"
	@echo "  make test         - Vitest suite"
	@echo "  make test-engine  - Vitest, verbose"
	@echo "  make build        - Typecheck + production bundle"
	@echo "  make check        - lint + test + build, the same as CI"
	@echo "  make clean        - Remove build output"
	@echo ""
	@echo "Agent mode:"
	@echo "  CUYO_AI_MODE=1 make check runs the same gates without the banners,"
	@echo "  npm preamble or vite build chatter. It does not touch the vitest"
	@echo "  reporter: forcing a terser one costs more output, not less."
	@echo ""
	@echo "The corpus tests read .context/upstream-cuyo and fail loudly if it is"
	@echo "absent. Run 'make corpus' on a fresh clone."

init:
	@if [ ! -d node_modules ]; then $(AI_ECHO) "Installing dependencies..."; fi
	@$(NPM) install $(NPM_INSTALL)

dev:
	@$(NPM) $(NPM_RUN) run dev

# Exposed on all interfaces, so a phone on the same network can load it. This is
# the whole point of a project that targets phones, and the reason `dev` alone is
# not enough: it binds loopback only, so nothing but this machine can reach it.
# On an untrusted network, so be aware.
dev-lan:
	@$(NPM) $(NPM_RUN) run dev:lan

# The corpus tests read .context/upstream-cuyo and fail loudly without it, so
# `make corpus` is something a fresh clone needs rather than something to
# remember. It is idempotent and cheap when the tree is already there.
corpus:
	@bash scripts/fetch-cuyo.sh

# shellcheck is a system package, so `npm ci` does not install it and a developer
# may not have it. CI installs a pinned version; locally the target says so rather
# than silently passing.
lint-shell:
	@command -v shellcheck >/dev/null 2>&1 || { \
		echo "shellcheck is not installed. Install it with:"; \
		echo "  Debian/Ubuntu: sudo apt-get install shellcheck"; \
		echo "  macOS:         brew install shellcheck"; \
		exit 1; \
	}
	$(AI_ECHO) "Linting shell scripts..."
	@shellcheck scripts/*.sh

# Needs a built bundle, so it is not part of `lint` - it is its own target, and
# CI runs it in the build job. `make check` runs it after the build.
check-art:
	@bash scripts/check-no-upstream-art.sh

lint: lint-code lint-types lint-docs lint-specs

# ESLint. The engine/ boundary rule lives in eslint.config.js, so this is also the
# check that `engine/` stays runnable in plain Node.
lint-code:
	$(AI_ECHO) "Linting code..."
	@$(NPX) $(NPX_FLAGS) eslint . $(ESLINT_FLAGS)

lint-types:
	$(AI_ECHO) "Type checking..."
	@$(NPX) $(NPX_FLAGS) tsc --noEmit $(TSC_FLAGS)

# markdownlint-cli2 has no quiet flag, so scripts/lint-docs.sh filters its
# three-line header and keeps everything else, including the exit status.
lint-docs:
	$(AI_ECHO) "Linting documentation..."
	@$(NPM) $(NPM_RUN) run lint:docs

lint-specs:
	$(AI_ECHO) "Validating OpenSpec..."
	@$(NPX) $(NPX_FLAGS) openspec validate --strict --all

test:
	$(AI_ECHO) "Running tests..."
	@$(NPM) $(NPM_RUN) test

test-engine:
	@$(NPM) $(NPM_RUN) test -- --reporter=verbose

build:
	$(AI_ECHO) "Building..."
	@$(NPM) $(NPM_RUN) run $(BUILD_TARGET)

# The single command CI runs, so that "green locally" and "green on GitHub" mean
# the same thing. `make check` is not a separate set of checks: it is these four
# targets in the order a person would run them.
check: lint test build check-art
	$(AI_ECHO) "All checks passed."

preview:
	@$(NPM) $(NPM_RUN) run preview

preview-host:
	@$(NPM) $(NPM_RUN) run preview -- --host 127.0.0.1 --port 4173

clean:
	rm -rf dist

distclean: clean
	rm -rf node_modules