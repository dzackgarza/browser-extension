# browser-extension (Hypothesis fork)

Adds a **Send to agent** button (`src/background/review-button.ts`, mounted on PDFs in
`src/pdfjs-init.js`) and math-aware sidebar quotes (vendored client fork).

**Use `just`, never `make` directly.** `just build` pins `settings/custom.json` (the
gitignored file with the real reviewGroup + agent token); a plain `make build` uses
`chrome-dev.json` and ships an empty Send config. `just check` = eslint + tsc.
`build/` and `settings/custom.json` are gitignored — the token is never committed.
