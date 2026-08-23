// Builds update.json for the release that was just published on this repo. Run by
// .github/workflows/publish-manifest.yml -- see that file's header comment for the trigger
// and why it fires on `published`, not at draft-creation time.
//
// Validates its own output against the same rules Controla's UpdateService/UpdateMetadata
// enforce (controla_network/lib/src/update/update_service.dart) -- a bug here should fail
// the CI job loudly, not silently commit a manifest every installed app would reject anyway.
'use strict';
const fs = require('fs');

const HEX64 = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+/;

const tag = process.env.TAG || '';
const repo = process.env.REPO || '';
const releaseBody = (process.env.RELEASE_BODY || '').trim();
const winSha = (process.env.WIN_SHA || '').trim();
const apkSha = (process.env.APK_SHA || '').trim();

const version = tag.replace(/^v/, '');
if (!SEMVER.test(version)) {
  throw new Error(
    `Tag "${tag}" does not look like vMAJOR.MINOR.PATCH -- refusing to publish a manifest ` +
      'the app would reject'
  );
}

let existing = {};
try {
  existing = JSON.parse(fs.readFileSync('update.json', 'utf8'));
} catch {
  // No existing manifest, or it doesn't parse as JSON -- start fresh rather than fail the job;
  // the first-ever manifest commit (v1.0.0) hit exactly this path.
}

const manifest = {
  version,
  changelog: releaseBody || 'See the release page.',
};

// Carry forward a manually-set minimum_supported_version. This automation has no way to
// decide when an update becomes mandatory, so it never sets or clears this on its own --
// edit update.json by hand for that, same as before this workflow existed.
if (existing.minimum_supported_version) {
  manifest.minimum_supported_version = existing.minimum_supported_version;
}

manifest.release_page_url = `https://github.com/${repo}/releases/latest`;

function artifact(name, sha) {
  if (!sha) return undefined;
  if (!HEX64.test(sha)) {
    throw new Error(
      `Computed sha256 for ${name} is not a 64-char hex digest ("${sha}") -- refusing to ` +
        'publish a broken manifest'
    );
  }
  return {
    url: `https://github.com/${repo}/releases/download/${tag}/${name}`,
    sha256: sha,
  };
}

const windows = artifact('Controla_Setup.exe', winSha);
if (windows) manifest.windows = windows;

const android = artifact('Controla.apk', apkSha);
if (android) manifest.android = android;

if (!windows && !android) {
  throw new Error(
    'Neither Controla_Setup.exe nor Controla.apk was found on this release -- refusing to ' +
      'publish an update.json with no artifacts'
  );
}

fs.writeFileSync('update.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Wrote update.json:\n' + JSON.stringify(manifest, null, 2));
