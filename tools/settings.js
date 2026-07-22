#!/usr/bin/env node

/**
 * Outputs a JSON object representing the extension settings based on a settings
 * file and the package environment.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import gitDescribe from 'git-describe';
const { gitDescribeSync } = gitDescribe;

// Suppress (expected) EPIPE errors on STDOUT
process.stdout.on('error', err => {
  if (err.code === 'EPIPE') {
    process.exit();
  }
});

/**
 * getVersion fetches the current version from git, applying the following
 * rules:
 *
 * - If buildType is 'production' and the git state is not clean, throw an error
 * - Set the version number to X.Y.Z.W, where X.Y.Z is the last tagged release
 *   and W is the number of commits since that release.
 * - If the buildType is 'production', set the version name to "Official Build",
 *   otherwise set it to a string of the form "gXXXXXXX[.dirty]" to reflect the
 *   exact commit and state of the repository.
 */
function getVersion(buildType) {
  const gitInfo = gitDescribeSync();

  if (buildType === 'production' && gitInfo.dirty) {
    throw new Error('cannot create production build with dirty git state!');
  }

  const version = `${gitInfo.semver}.${gitInfo.distance}`;
  let versionName = 'Official Build';

  if (buildType !== 'production') {
    versionName = `${gitInfo.hash}${gitInfo.dirty ? '.dirty' : ''}`;
  }

  return { version, versionName };
}

/**
 * Chrome derives the extension ID from the manifest's `key`, and that ID
 * decides which storage, service worker and API grants an installed build
 * receives. Two deployments built with the same key are the same extension as
 * far as the browser is concerned and collide on all identity-derived state,
 * so every Chrome deployment must supply its own key explicitly. A missing or
 * empty value is a configuration error and stops the build here rather than
 * producing an installable artifact with a borrowed identity.
 */
function checkExtensionIdentity(settings, settingsPath) {
  if (!settings.browserIsChrome) {
    // Firefox manifests carry no `key`; identity comes from the signed XPI.
    return;
  }

  const { key } = settings;
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(
      `${settingsPath} does not set "key". Chrome builds must supply the ` +
        'extension packaging public key, which determines the extension ID ' +
        'and therefore the identity of the installed extension.',
    );
  }
}

if (process.argv.length !== 3) {
  console.error('Usage: %s <settings.json>', path.basename(process.argv[1]));
  process.exit(1);
}

const settingsPath = process.argv[2];
const settings = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), settingsPath)),
);

checkExtensionIdentity(settings, settingsPath);

const settingsOut = {
  ...settings,
  ...getVersion(settings.buildType),
};

if (settingsOut.sentryPublicDSN) {
  settingsOut.raven = {
    dsn: settingsOut.sentryPublicDSN,
    release: settingsOut.version,
  };
}

console.log(JSON.stringify(settingsOut));
