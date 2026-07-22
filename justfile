# Tasks for this Hypothesis extension fork. Use `just`, never `make` directly.
#
# The real Send-to-agent config (reviewGroup + agent token) lives in the gitignored
# settings/custom.json; a plain `make build` uses chrome-dev.json and ships an empty
# Send config, so every build here pins custom.json.

ai_review_ci_schema_version := "1"
ai_review_ci_profile := "bun"
ai_review_ci_ref := "main"
ai_review_ci_release_channel := "main"
ai_review_ci_workflow_template_version := "1"
ai_review_ci_local_delegation := "global-justfile"
ai_review_ci_default_branch := "main"
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

# Run commit-tier Bun/TypeScript QC through the central implementation.
test-commit:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . test-commit

# Run the full Bun test suite before pushing.
test-push:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . test-push

# Run CI acceptance QC through the central implementation.
test-ci:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . test-ci

[private]
_test-review-button:
    yarn test --grep review-button-test
