# Tasks for this Hypothesis extension fork. Use `just`, never `make` directly.
#
# Local extension settings live in the gitignored settings/custom.json.

settings := "settings/custom.json"

# List available recipes.
default:
    @just --list

# Build into build/ (load this unpacked in Chrome).
build:
    make build SETTINGS_FILE={{settings}}

# Rebuild on change.
dev:
    make dev SETTINGS_FILE={{settings}}

# eslint + tsc.
check:
    make lint

# prettier --write.
format:
    make format

# Commit-tier QC: formatting, lint, and types via upstream's native tooling.
# This extension is an upstream hypothesis/browser-extension fork and keeps native QC;
# the ai-review-ci language gates do not apply (user decision; see the h/client forks).
test-commit:
    make checkformatting
    make lint

# Push-tier QC: commit tier plus the full test suite.
test-push: test-commit
    yarn test

# CI-tier QC: push tier plus the build-settings gate and a production build.
test-ci: test-push
    make checkbuild
    make build SETTINGS_FILE={{settings}}
