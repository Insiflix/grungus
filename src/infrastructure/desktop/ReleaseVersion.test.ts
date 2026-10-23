import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { releaseInfo } = require("../../../scripts/release-version.cjs");
const lock = (version: string) => ({ version, packages: { "": { version } } });

it("releases a changed version and skips other package.json changes", () => {
  expect(releaseInfo({ version: "1.2.0" }, { version: "1.1.0" }, lock("1.2.0")))
    .toEqual({ changed: true, version: "1.2.0", tag: "v1.2.0", prerelease: false });
  expect(releaseInfo({ version: "1.2.0" }, { version: "1.2.0" }, lock("1.2.0")).changed).toBe(false);
});

it("allows bootstrapping a release and identifies prereleases", () => {
  expect(releaseInfo({ version: "0.1.0" }, undefined, lock("0.1.0")).changed).toBe(true);
  expect(releaseInfo({ version: "1.2.0-beta.1" }, undefined, lock("1.2.0-beta.1")).prerelease).toBe(true);
  expect(releaseInfo({ version: "1.2.0+build-test" }, undefined, lock("1.2.0+build-test")).prerelease).toBe(false);
});

it.each(["1.2", "01.2.3", "1.2.3-beta.01", "v1.2.3", "1.2.3\ninvalid"])("rejects invalid release version %s", version => {
  expect(() => releaseInfo({ version }, undefined, lock(version))).toThrow("valid SemVer");
});

it("rejects a stale lockfile before building or publishing", () => {
  expect(() => releaseInfo({ version: "1.2.0" }, undefined, lock("1.1.0"))).toThrow("out of sync");
  expect(() => releaseInfo({ version: "1.2.0" }, undefined, { version: "1.2.0", packages: { "": { version: "1.1.0" } } })).toThrow("out of sync");
});

it("skips published releases, resumes matching drafts, and fails closed on API errors", async () => {
  const detect = require("../../../scripts/release-version.cjs");
  const context = { eventName: "workflow_dispatch", payload: {}, repo: { owner: "example", repo: "app" }, sha: "commit" };
  const outputs: Record<string, string> = {};
  const core = { info: () => {}, setOutput: (key: string, value: string) => { outputs[key] = value; } };
  const api = (getReleaseByTag: () => Promise<unknown>) => ({ rest: { repos: { getReleaseByTag } } });
  await detect({ context, core, github: api(async () => ({ data: { draft: false } })) });
  expect(outputs.changed).toBe("false");
  await detect({ context, core, github: api(async () => ({ data: { draft: true, target_commitish: "commit" } })) });
  expect(outputs.changed).toBe("true");
  await detect({ context, core, github: api(async () => { throw { status: 404 }; }) });
  expect(outputs.changed).toBe("true");
  await expect(detect({ context, core, github: api(async () => { throw { status: 403 }; }) })).rejects.toEqual({ status: 403 });
  await expect(detect({ context, core, github: api(async () => ({ data: { draft: true, target_commitish: "another-commit" } })) })).rejects.toThrow("another commit");
});

it("resumes draft uploads and only publishes after every upload succeeds", async () => {
  const files = [
    "Grungus-1.2.0-windows-setup.exe", "Grungus-1.2.0-windows-setup.exe.blockmap",
    "Grungus-1.2.0-linux-x86_64.AppImage", "Grungus-1.2.0-linux-arm64.AppImage",
    "latest.yml", "latest-linux.yml", "latest-linux-arm64.yml",
  ];
  const events: string[] = [];
  let failUpload = false;
  const module = { exports: undefined as unknown };
  runInNewContext(readFileSync("scripts/publish-release.cjs", "utf8"), {
    module,
    require: (name: string) => name === "node:fs" ? { readdirSync: () => files }
      : name === "node:child_process" ? { execFileSync: (command: string, args: string[]) => {
        if (command === "gh") {
          if (failUpload) throw new Error("Upload failed");
          events.push("upload");
        }
        return "";
      } } : require(name),
    process: { env: { RELEASE_TAG: "v1.2.0", RELEASE_VERSION: "1.2.0", RELEASE_PRERELEASE: "false" } },
  });
  const publish = module.exports as (options: unknown) => Promise<void>;
  const options = {
    context: { repo: { owner: "example", repo: "app" }, sha: "commit" },
    core: { info: () => {} },
    github: {
      paginate: async () => [{ tag_name: "v1.2.0", draft: true, target_commitish: "commit", id: 42 }],
      rest: { repos: {
        listReleases: () => {},
        createRelease: () => { throw new Error("Must reuse existing draft"); },
        updateRelease: async () => { events.push("publish"); },
      } },
    },
  };
  await publish(options);
  expect(events).toEqual(["upload", "publish"]);
  events.length = 0;
  files[2] = "Grungus-1.2.0-linux-x64.AppImage";
  await expect(publish(options)).rejects.toThrow("Missing release asset: Grungus-1.2.0-linux-x86_64.AppImage");
  expect(events).toEqual([]);
  files[2] = "Grungus-1.2.0-linux-x86_64.AppImage";
  failUpload = true;
  await expect(publish(options)).rejects.toThrow("Upload failed");
  expect(events).toEqual([]);
  files.pop();
  await expect(publish(options)).rejects.toThrow("Missing release asset");
});
