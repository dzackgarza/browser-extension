# Tasks for this Hypothesis extension fork. Use `just`, never `make` directly.
#
# The real Send-to-agent config (reviewGroup + agent token) lives in the gitignored
# settings/custom.json; a plain `make build` uses chrome-dev.json and ships an empty
# Send config, so every build here pins custom.json.

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

# CI-tier QC: push tier plus a production build.
test-ci: test-push
    make build

[private]
_test-review-button:
    yarn test --grep review-button-test
