# Tasks for this Hypothesis extension fork. Use `just`, never `make` directly.
#
# The real Send-to-agent config (reviewGroup + agent token) lives in the gitignored
# settings/custom.json; a plain `make build` uses chrome-dev.json and ships an empty
# Send config, so every build here pins custom.json.
settings := "settings/custom.json"

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
