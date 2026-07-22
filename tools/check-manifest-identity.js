#!/usr/bin/env node

/**
 * Build-boundary proof for the extension's cryptographic identity.
 *
 * Chrome derives the extension ID from the manifest's `key`, so a build that
 * silently substitutes someone else's key produces an installable artifact
 * that collides with another deployment on every piece of identity-derived
 * state. That failure is invisible at build time, so this check runs the real
 * build and asserts that a missing or empty `key` stops it.
 *
 * It drives `make build/manifest.json`, not a re-implementation of it, so it
 * proves the pipeline that actually ships: tools/settings.js plus
 * src/manifest.json.mustache.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { globSync } from 'glob';

const MANIFEST = 'build/manifest.json';
const SETTINGS_OUT = 'build/settings.json';
const PROOF_DIR = 'build/manifest-identity-proof';
const BASE_SETTINGS = 'settings/chrome-dev.json';

/**
 * A key held by no settings file and no source file. A manifest carrying it can
 * only have obtained it from the settings file the build was pointed at.
 */
const PROOF_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtVxBRRAtybRz1YXKwOFuoIZ0DlSl' +
  'CFwqFY9GEmefRbNy0kOwXtE9RRE0Q8AVXHm0LBoRcAKtQzNhwQwHmnIzKRLQ8f3JXR8dyzoS' +
  'proofonlyproofonlyproofonlyproofonlyproofonlyproofonlyproofonlyproofonly';

/** Render the manifest through the real build for `settingsFile`. */
function runBuild(settingsFile) {
  fs.rmSync(MANIFEST, { force: true });
  const result = spawnSync(
    'make',
    [MANIFEST, `SETTINGS_FILE=${settingsFile}`],
    { encoding: 'utf8' },
  );
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    manifestExists: fs.existsSync(MANIFEST),
  };
}

/** Write a settings file derived from the tracked Chrome dev settings. */
function proofSettings(name, mutate) {
  const settings = JSON.parse(fs.readFileSync(BASE_SETTINGS, 'utf8'));
  mutate(settings);
  const file = `${PROOF_DIR}/${name}.json`;
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  return file;
}

fs.mkdirSync(PROOF_DIR, { recursive: true });

// 1. Absent identity: the build must stop and leave no artifact behind.
{
  const file = proofSettings('absent-key', settings => delete settings.key);
  const { status, output, manifestExists } = runBuild(file);

  assert.notEqual(status, 0, 'build without an extension key must fail');
  assert.equal(manifestExists, false, 'failed build must emit no manifest');
  assert.ok(
    output.includes('"key"'),
    'build failure must name the missing setting',
  );
  assert.ok(
    output.includes(file),
    'build failure must name the settings file expected to carry it',
  );
}

// 2. Empty identity is a configuration error too, not an accepted input.
{
  const file = proofSettings('empty-key', settings => {
    settings.key = '';
  });
  const { status, manifestExists } = runBuild(file);

  assert.notEqual(status, 0, 'build with an empty extension key must fail');
  assert.equal(manifestExists, false, 'failed build must emit no manifest');
}

// 3. A supplied identity reaches the manifest, and nothing else does.
{
  const file = proofSettings('supplied-key', settings => {
    settings.key = PROOF_KEY;
  });
  const { status, manifestExists } = runBuild(file);

  assert.equal(status, 0, 'build with an extension key must succeed');
  assert.equal(manifestExists, true, 'successful build must emit a manifest');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  assert.equal(
    manifest.key,
    PROOF_KEY,
    'manifest must carry exactly the supplied extension key',
  );
}

// 4. Every Chrome settings file that ships an installable artifact carries its
//    own identity, and no two deployments share one.
{
  const seen = new Map();
  for (const file of globSync('settings/*.json').sort()) {
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!settings.browserIsChrome) {
      continue;
    }
    assert.equal(
      typeof settings.key === 'string' && settings.key.length > 0,
      true,
      `${file} must set a non-empty "key"`,
    );
    const owner = seen.get(settings.key);
    assert.equal(
      owner,
      undefined,
      `${file} shares its extension identity with ${owner}`,
    );
    seen.set(settings.key, file);
  }
  assert.ok(seen.size > 0, 'expected at least one Chrome settings file');
}

// Leave no proof artifact that could be mistaken for a build, and restore the
// generated settings for the repository's default SETTINGS_FILE.
fs.rmSync(MANIFEST, { force: true });
fs.rmSync(PROOF_DIR, { recursive: true, force: true });
fs.rmSync(SETTINGS_OUT, { force: true });
const restore = spawnSync('make', [SETTINGS_OUT], { encoding: 'utf8' });
assert.equal(restore.status, 0, 'failed to restore build/settings.json');

console.log('Manifest identity build-boundary checks passed.');
