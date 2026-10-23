const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = async function publish({ github, context, core }) {
  const tag = process.env.RELEASE_TAG;
  const version = process.env.RELEASE_VERSION;
  const prerelease = process.env.RELEASE_PRERELEASE === 'true';
  const directory = 'release-assets';
  const files = readdirSync(directory);
  const required = [
    `Grungus-${version}-windows-setup.exe`,
    `Grungus-${version}-windows-setup.exe.blockmap`,
    `Grungus-${version}-linux-x64.AppImage`,
    `Grungus-${version}-linux-arm64.AppImage`,
    'latest.yml', 'latest-linux.yml', 'latest-linux-arm64.yml',
  ];
  for (const file of required) {
    if (!files.includes(file)) throw new Error(`Missing release asset: ${file}`);
  }
  // The by-tag endpoint only guarantees published releases. Listing with the
  // publishing token also finds drafts left by an interrupted upload.
  const releases = await github.paginate(github.rest.repos.listReleases, { ...context.repo, per_page: 100 });
  let release = releases.find(item => item.tag_name === tag);
  if (release) {
    if (!release.draft) {
      core.info(`${tag} is already published; leaving its assets intact.`);
      return;
    }
    if (release.target_commitish !== context.sha) throw new Error('Draft release belongs to another commit');
  }
  // Reject a pre-existing tag pointing elsewhere before creating a release.
  execFileSync('git', ['fetch', '--tags', 'origin'], { stdio: 'inherit' });
  const tags = execFileSync('git', ['tag', '--list', tag], { encoding: 'utf8' }).trim();
  if (tags) {
    const commit = execFileSync('git', ['rev-list', '-n', '1', tag], { encoding: 'utf8' }).trim();
    if (commit !== context.sha) throw new Error(`${tag} points to another commit`);
  }
  if (!release) {
    ({ data: release } = await github.rest.repos.createRelease({
      ...context.repo, tag_name: tag, target_commitish: context.sha,
      name: `Grungus ${version}`, draft: true, prerelease, generate_release_notes: true,
    }));
  }
  // Upload to a draft first so clients never see a partial set of update assets.
  execFileSync('gh', [
    'release', 'upload', tag, ...files.map(file => join(directory, file)),
    '--repo', `${context.repo.owner}/${context.repo.repo}`, '--clobber',
  ], { stdio: 'inherit' });
  await github.rest.repos.updateRelease({
    ...context.repo, release_id: release.id, draft: false, prerelease,
    make_latest: prerelease ? 'false' : 'legacy',
  });
  core.info(`Published ${release.html_url}`);
};
