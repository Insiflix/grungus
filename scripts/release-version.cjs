const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

function releaseInfo(current, previous, lock) {
  // Full SemVer, including numeric prerelease identifiers without leading zeros.
  const number = '(0|[1-9][0-9]*)';
  const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
  const semver = new RegExp(`^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
  if (typeof current.version !== 'string' || !semver.test(current.version)) {
    throw new Error('package.json must contain a valid SemVer version');
  }
  if (lock.version !== current.version || lock.packages?.['']?.version !== current.version) {
    throw new Error('package-lock.json version is out of sync; use npm version');
  }
  return {
    changed: current.version !== previous?.version,
    version: current.version,
    tag: `v${current.version}`,
    prerelease: current.version.split('+')[0].includes('-'),
  };
}

module.exports = async function detect({ github, context, core }) {
  let previous;
  const before = context.payload.before;
  if (context.eventName === 'push' && before && !/^0+$/.test(before)) {
    // Fail if the previous commit cannot be read; a failed lookup must not publish.
    const files = execFileSync('git', ['ls-tree', '--name-only', before, '--', 'package.json'], { encoding: 'utf8' });
    if (files.trim()) {
      previous = JSON.parse(execFileSync('git', ['show', `${before}:package.json`], { encoding: 'utf8' }));
    }
  }
  const info = releaseInfo(
    JSON.parse(readFileSync('package.json', 'utf8')),
    previous,
    JSON.parse(readFileSync('package-lock.json', 'utf8')),
  );
  if (info.changed) {
    try {
      const { data: release } = await github.rest.repos.getReleaseByTag({ ...context.repo, tag: info.tag });
      if (!release.draft) {
        core.info(`${info.tag} is already published; skipping.`);
        info.changed = false;
      } else if (release.target_commitish !== context.sha) {
        throw new Error(`Existing draft ${info.tag} belongs to another commit`);
      }
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  for (const [name, value] of Object.entries(info)) core.setOutput(name, String(value));
};
module.exports.releaseInfo = releaseInfo;
