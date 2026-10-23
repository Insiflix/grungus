# Desktop builds, releases, and updates

GitHub Actions builds Windows and Linux when the `version` in `package.json`
changes on the repository's default branch. Other changes to `package.json`
do not produce a release. A push containing several commits compares the version
before the entire push with the final version. Pull requests and other branches
cannot publish releases.

## Publish a version

```sh
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release next patch version"
git push
```

Use `minor`, `major`, or an explicit SemVer version as appropriate. Commit both
the package file and lockfile. No manual tag is required: the workflow creates
`v<version>` and the release at the exact commit it built.

For the first release, or to retry a failed build, run **Build and release desktop
app** with **Run workflow** on the default branch. This builds the current
version if it is not already published. A published version is never overwritten.
A failed upload leaves a draft which can be resumed by rerunning the same commit.
If the code changes after a failed upload, delete that draft before retrying with
the same version, or bump the version again. An existing tag pointing at another
commit is rejected.

## Release artifacts

| Platform | Architecture | Download |
| --- | --- | --- |
| Windows | x64 and ARM64 | One NSIS `.exe` installer selecting the native architecture |
| Linux | x64 | `Grungus-<version>-linux-x64.AppImage` |
| Linux | ARM64 | `Grungus-<version>-linux-arm64.AppImage` |

Linux builds use native Ubuntu 24.04 runners for each architecture. AppImages
serve multiple Linux distributions; compatibility still depends on the host's
Electron/system-library requirements. On systems requiring it, install FUSE 2
support (for example `libfuse2t64` on Ubuntu 24.04). Mark the downloaded AppImage
executable and keep it in a directory writable by your user so updates can
replace it. macOS is excluded from the workflow.

Every build runs `npm ci`, tests, TypeScript checks, and compilation before
packaging with Electron Builder. Only installers, AppImages, blockmaps, and
`latest*.yml` manifests are uploaded. The release remains a draft until all
platform builds succeed and all required assets are uploaded.

## GitHub configuration

The public update/download repository is explicitly configured in `package.json`:
[`Insiflix/grungus-frontend`](https://github.com/Insiflix/grungus-frontend/releases).
The workflow must run in that repository. GitHub Actions must be enabled and
repository/organization policy must permit the publishing job's `contents: write`
permission. The built-in `GITHUB_TOKEN` creates releases and uploads assets;
no personal token or separate hosting service is required.

If builds should include the GIF provider key, add the optional Actions secret
`VITE_KLIPY_API_KEY`. Vite embeds this client key in the app, as with local builds.
Never use that variable for a secret that must stay private.

Windows builds currently use no signing certificate and may display Windows
SmartScreen/unknown-publisher prompts. Signing can be configured separately in
Electron Builder when a certificate is available.

## Installed application updates

`electron-updater` uses the GitHub feed embedded by Electron Builder. Installed
Windows builds and running Linux AppImages check on startup and every four hours.
Available updates download automatically. A dialog offers a restart after the
download; choosing **Später** installs the update on normal application exit.
Network/update failures are logged and do not prevent launching the app.
Development and unpacked Linux builds do not check for updates.

Stable installations receive stable releases. Versions such as `1.0.0-beta.1`
are published as GitHub prereleases and opt into preview updates. Downgrades are
disabled. Keep the `latest*.yml` and `.blockmap` release assets: the updater needs
them along with the application downloads. Users need no GitHub account or token.

Before relying on a first production rollout, exercise an actual update from
one installed version to the next on Windows and both Linux architectures;
local compilation cannot verify GitHub permissions or OS installer behavior.

References: [Electron Builder auto updates](https://www.electron.build/v26/docs/features/auto-update/),
[GitHub publishing](https://www.electron.build/v26/docs/publish/).
