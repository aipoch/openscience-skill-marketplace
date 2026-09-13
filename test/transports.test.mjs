import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { s3Store, skillCdnBaseUrl } from "../scripts/lib/transports.mjs";

test("CDN configuration accepts only HTTPS origins and fixes the Skill route", () => {
  for (const origin of ["https://cdn.example.com", "https://cdn.example.com/"])
    assert.equal(
      skillCdnBaseUrl(origin).href,
      "https://cdn.example.com/open-science/skill-marketplace/v1/",
    );
  for (const origin of [
    "http://cdn.example.com",
    "https://user:pass@cdn.example.com",
    "https://cdn.example.com/?x=1",
    "https://cdn.example.com/#fragment",
    "https://cdn.example.com/open-science/skill-marketplace/v1/",
    "https://cdn.example.com/other/..",
    "https://cdn.example.com\\other",
    " https://cdn.example.com",
    "https://cdn.example.com/\n",
  ])
    assert.throws(() => skillCdnBaseUrl(origin));
  for (const distributionId of [undefined, "", "bad/id", "--option"])
    assert.throws(
      () =>
        s3Store({
          bucket: "test-bucket",
          baseUrl: "https://cdn.example.com",
          distributionId,
        }),
      /distribution ID/,
    );
});

test("S3 publication refreshes both stable paths before verification and recovers after CloudFront failures", async (t) => {
  const { publishSnapshot, directoryStore } =
    await import("../scripts/lib/publish.mjs");
  const { buildCatalog } = await import("../scripts/lib/build.mjs");
  const { signRoot } = await import("../scripts/lib/signing.mjs");
  const { jsonBytes } = await import("../scripts/lib/common.mjs");
  const { makeCandidate } = await import("./fixtures.mjs");
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pin = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const sign = (candidate) =>
    signRoot(candidate.rootBytes, {
      privateKey,
      expectedPublicKey: pin,
      keyId: "openscience-skills-test",
    });
  const previous = buildCatalog([makeCandidate("alpha")]);
  const candidate = buildCatalog(
    [makeCandidate("alpha"), makeCandidate("beta")],
    { history: previous.objects, previousRoot: previous.root },
  );
  const signature = sign(candidate);
  const prefix = "open-science/skill-marketplace/v1/";
  for (const failure of [
    "upload",
    "create",
    "wait",
    "response",
    "stale",
    "none",
  ]) {
    await t.test(failure, async () => {
      const temporary = await mkdtemp(
        path.join(os.tmpdir(), "skill-cloudfront-"),
      );
      try {
        const github = await directoryStore(path.join(temporary, "github"));
        const objects = new Map();
        for (const [p, bytes] of previous.objects) {
          await github.putImmutable(p, bytes);
          objects.set(prefix + p, bytes);
        }
        await github.writeRootSignature(jsonBytes(sign(previous)));
        await github.writeRoot(previous.rootBytes);
        const publicStable = new Map([
          [prefix + "marketplace.json", previous.rootBytes],
          [prefix + "marketplace.json.sig", jsonBytes(sign(previous))],
        ]);
        for (const [key, bytes] of publicStable) objects.set(key, bytes);
        const events = [];
        let fail = failure !== "none";
        const makeStore = () =>
          s3Store({
            bucket: "test-bucket",
            baseUrl: "https://cdn.example.com/",
            distributionId: "EDFDVBD6EXAMPLE",
            temporary: path.join(temporary, "cdn"),
            run: async (command, args) => {
              assert.equal(command, "aws");
              if (args[0] === "s3api") {
                const key = args[args.indexOf("--key") + 1];
                if (args[1] === "head-object") {
                  if (!objects.has(key))
                    throw new Error("HeadObject (404): Not Found");
                  return Buffer.from("{}");
                }
                events.push(`put:${key}`);
                if (
                  fail &&
                  failure === "upload" &&
                  key === prefix + "marketplace.json"
                )
                  throw new Error("injected upload failure");
                const bytes = await readFile(args[args.indexOf("--body") + 1]);
                if (args.includes("--if-none-match") && objects.has(key))
                  throw new Error("PreconditionFailed 412");
                objects.set(key, bytes);
                return Buffer.alloc(0);
              }
              if (args[1] === "create-invalidation") {
                events.push("invalidate");
                assert.deepEqual(args, [
                  "cloudfront",
                  "create-invalidation",
                  "--distribution-id",
                  "EDFDVBD6EXAMPLE",
                  "--paths",
                  `/${prefix}marketplace.json`,
                  `/${prefix}marketplace.json.sig`,
                  "--query",
                  "Invalidation.Id",
                  "--output",
                  "text",
                ]);
                assert.deepEqual(
                  objects.get(prefix + "marketplace.json"),
                  candidate.rootBytes,
                );
                assert.deepEqual(
                  objects.get(prefix + "marketplace.json.sig"),
                  jsonBytes(signature),
                );
                if (fail && failure === "create")
                  throw new Error("injected create failure");
                return Buffer.from(
                  fail && failure === "response" ? "None\n" : "IEXAMPLE\n",
                );
              }
              assert.deepEqual(args, [
                "cloudfront",
                "wait",
                "invalidation-completed",
                "--distribution-id",
                "EDFDVBD6EXAMPLE",
                "--id",
                "IEXAMPLE",
              ]);
              events.push("wait");
              if (fail && failure === "wait")
                throw new Error("injected wait failure");
              if (!(fail && failure === "stale"))
                for (const key of publicStable.keys())
                  publicStable.set(key, objects.get(key));
              return Buffer.alloc(0);
            },
            fetchImpl: async (url) => {
              const key = new URL(url).pathname.slice(1);
              const stable = publicStable.has(key);
              if (stable) events.push(`read:${key}`);
              const bytes = stable ? publicStable.get(key) : objects.get(key);
              return new Response(bytes ?? null, { status: bytes ? 200 : 404 });
            },
          });
        const publish = () =>
          publishSnapshot({
            candidate,
            signature,
            pin,
            github,
            cdn: makeStore(),
            baseRevision: previous.root.revision,
            history: { ...previous, signature: sign(previous) },
          });
        if (fail) {
          await assert.rejects(
            publish(),
            /injected|invalid CloudFront invalidation ID|stable GitHub\/CDN metadata mismatch/,
          );
          if (["upload", "create", "response"].includes(failure))
            assert.equal(events.includes("wait"), false);
          if (failure === "upload")
            assert.equal(events.includes("invalidate"), false);
        }
        fail = false;
        events.length = 0;
        await publish();
        const invalidate = events.indexOf("invalidate"),
          wait = events.indexOf("wait");
        assert.ok(
          events.indexOf(`put:${prefix}marketplace.json.sig`) <
            events.indexOf(`put:${prefix}marketplace.json`),
        );
        assert.ok(events.indexOf(`put:${prefix}marketplace.json`) < invalidate);
        assert.ok(invalidate < wait);
        assert.deepEqual(events.slice(wait + 1), [
          `read:${prefix}marketplace.json`,
          `read:${prefix}marketplace.json.sig`,
        ]);
        assert.deepEqual(
          (await makeStore().readRoot()).rootBytes,
          candidate.rootBytes,
        );
        await publish();
        // A conditional-write race must compare existing bytes, never replace them.
        const store = makeStore();
        const [name, bytes] = candidate.objects.entries().next().value;
        await store.putImmutable(name, bytes);
        await assert.rejects(
          store.putImmutable(name, Buffer.from("conflict")),
          /immutable CDN conflict/,
        );
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    });
  }
});

test("CDN transport uses conditional immutable writes and verifies the public bytes", async () => {
  const { s3Store } = await import("../scripts/lib/transports.mjs");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "skill-s3-test-"));
  const objects = new Map();
  const commands = [];
  try {
    const store = s3Store({
      bucket: "test-bucket",
      baseUrl: "https://cdn.example.com",
      distributionId: "EDFDVBD6EXAMPLE",
      temporary: tmp,
      run: async (command, args) => {
        commands.push([command, args]);
        const key = args[args.indexOf("--key") + 1];
        if (args[1] === "head-object") {
          if (!objects.has(key)) throw new Error("HeadObject (404): Not Found");
          return Buffer.from("{}");
        }
        const bytes = await readFile(args[args.indexOf("--body") + 1]);
        objects.set(key, bytes);
        return Buffer.from("{}");
      },
      fetchImpl: async (url) => {
        const b = objects.get(new URL(url).pathname.slice(1));
        return new Response(b ?? null, { status: b ? 200 : 404 });
      },
    });
    assert.equal(await store.read("shards/test.zip"), undefined);
    await store.putImmutable("shards/test.zip", Buffer.from("zip"));
    assert.deepEqual(await store.read("shards/test.zip"), Buffer.from("zip"));
    assert.equal(commands[0][0], "aws");
    const put = commands.find(([, args]) => args[1] === "put-object");
    assert.ok(put[1].includes("--if-none-match"));
    assert.ok(put[1].includes("*"));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("S3 absence is authoritative while access failures and unavailable public objects remain fatal", async () => {
  for (const code of [
    "404",
    "NotFound",
    "NoSuchKey",
    "403",
    "AccessDenied",
    "500",
  ]) {
    let fetched = false;
    const store = s3Store({
      bucket: "test-bucket",
      baseUrl: "https://cdn.example.com",
      distributionId: "ETEST",
      run: async (command, args) => {
        assert.equal(command, "aws");
        assert.deepEqual(args, [
          "s3api",
          "head-object",
          "--bucket",
          "test-bucket",
          "--key",
          "open-science/skill-marketplace/v1/marketplace.json",
        ]);
        throw Object.assign(new Error("AWS command failed"), {
          stderr: Buffer.from(
            `An error occurred (${code}) when calling the HeadObject operation`,
          ),
        });
      },
      fetchImpl: async () => {
        fetched = true;
        return new Response(null, { status: 403 });
      },
    });
    if (["404", "NotFound", "NoSuchKey"].includes(code))
      assert.equal(await store.readRoot(), undefined);
    else await assert.rejects(store.readRoot(), /AWS command failed/);
    assert.equal(fetched, false);
  }
  for (const status of [403, 404]) {
    const store = s3Store({
      bucket: "test-bucket",
      baseUrl: "https://cdn.example.com",
      distributionId: "ETEST",
      run: async () => Buffer.from("{}"),
      fetchImpl: async () => new Response(null, { status }),
    });
    await assert.rejects(store.readRoot(), /HTTP 403|unavailable from CDN/);
  }
});

test("first publication never requests an unpublished CDN key that could cache a missing-object 403", async () => {
  const { publishSnapshot, directoryStore } =
    await import("../scripts/lib/publish.mjs");
  const { buildCatalog } = await import("../scripts/lib/build.mjs");
  const { signRoot } = await import("../scripts/lib/signing.mjs");
  const { makeCandidate } = await import("./fixtures.mjs");
  const { generateKeyPairSync } = await import("node:crypto");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-initial-cdn-"));
  try {
    const objects = new Map();
    let missingPublicReads = 0;
    const cdn = s3Store({
      bucket: "test-bucket",
      baseUrl: "https://cdn.example.com",
      distributionId: "ETEST",
      temporary,
      run: async (command, args) => {
        assert.equal(command, "aws");
        if (args[0] === "cloudfront")
          return Buffer.from(args[1] === "create-invalidation" ? "ITEST" : "");
        const key = args[args.indexOf("--key") + 1];
        if (args[1] === "head-object") {
          if (!objects.has(key)) throw new Error("HeadObject (404): Not Found");
          return Buffer.from("{}");
        }
        assert.equal(args[1], "put-object");
        if (args.includes("--if-none-match") && objects.has(key))
          throw new Error("PreconditionFailed 412");
        objects.set(key, await readFile(args[args.indexOf("--body") + 1]));
        return Buffer.from("{}");
      },
      fetchImpl: async (url) => {
        const bytes = objects.get(new URL(url).pathname.slice(1));
        if (!bytes) missingPublicReads++;
        return new Response(bytes ?? null, { status: bytes ? 200 : 403 });
      },
    });
    const candidate = buildCatalog([makeCandidate()]);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pin = publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
    const signature = signRoot(candidate.rootBytes, {
      privateKey,
      expectedPublicKey: pin,
      keyId: "openscience-skills-test",
    });
    const github = await directoryStore(path.join(temporary, "github"));
    const result = await publishSnapshot({
      candidate,
      signature,
      pin,
      github,
      cdn,
    });
    assert.equal(result.revision, candidate.root.revision);
    assert.deepEqual((await cdn.readRoot()).rootBytes, candidate.rootBytes);
    assert.equal(missingPublicReads, 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("GitHub transport creates one draft catalog release and never clobbers existing assets", async () => {
  const { githubStore, assetName } =
    await import("../scripts/lib/transports.mjs");
  const { copyFile, mkdir } = await import("node:fs/promises");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "skill-github-test-"));
  let release;
  const assets = new Map();
  const commands = [];
  try {
    const run = async (command, args) => {
      commands.push([command, args]);
      assert.equal(command, "gh");
      const action = args[1];
      if (action === "view") {
        if (!release) {
          const e = new Error("release not found");
          throw e;
        }
        return Buffer.from(JSON.stringify(release));
      }
      if (action === "create") {
        release = {
          assets: [],
          isDraft: true,
          targetCommitish: "a".repeat(40),
        };
        return Buffer.alloc(0);
      }
      if (action === "upload") {
        const filename = args[3];
        const name = path.basename(filename);
        assets.set(name, filename);
        release.assets.push({ name });
        return Buffer.alloc(0);
      }
      if (action === "download") {
        const name = args[args.indexOf("--pattern") + 1];
        const directory = args[args.indexOf("--dir") + 1];
        await mkdir(directory, { recursive: true });
        await copyFile(assets.get(name), path.join(directory, name));
        return Buffer.alloc(0);
      }
      throw new Error("unexpected operation");
    };
    const store = githubStore({
      repository: "test/repo",
      revision: "b".repeat(64),
      sourceCommit: "a".repeat(40),
      temporary: tmp,
      run,
    });
    await store.putImmutable("shards/example.zip", Buffer.from("archive"));
    await store.putImmutable("shards/example.zip", Buffer.from("archive"));
    const retry = githubStore({
      repository: "test/repo",
      revision: "b".repeat(64),
      sourceCommit: "c".repeat(40),
      temporary: tmp,
      run,
    });
    await retry.putImmutable("shards/second.zip", Buffer.from("second"));
    assert.equal(release.targetCommitish, "a".repeat(40));
    await assert.rejects(
      store.putImmutable("shards/example.zip", Buffer.from("different")),
      /immutable/,
    );
    assert.equal(commands.filter(([, a]) => a[1] === "create").length, 1);
    assert.equal(commands.filter(([, a]) => a[1] === "upload").length, 2);
    assert.ok(
      commands.find(([, a]) => a[1] === "create")[1].includes("--draft"),
    );
    assert.equal(
      commands.some(([, a]) => a[1] === "upload" && a.includes("--clobber")),
      false,
    );
    assert.match(
      assetName("releases/example/1.0.0.json"),
      /^[a-f0-9]{64}\.json$/,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("the GitHub adapter promotes real Git metadata and retries without another commit", async () => {
  const { githubStore, runCommand } =
    await import("../scripts/lib/transports.mjs");
  const { directoryStore, publishSnapshot } =
    await import("../scripts/lib/publish.mjs");
  const { buildCatalog } = await import("../scripts/lib/build.mjs");
  const { signRoot } = await import("../scripts/lib/signing.mjs");
  const { generateKeyPairSync } = await import("node:crypto");
  const { mkdir, copyFile, writeFile } = await import("node:fs/promises");
  const { makeCandidate } = await import("./fixtures.mjs");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "skill-published-git-"));
  const repo = path.join(tmp, "repo");
  await mkdir(repo);
  const git = (args) => runCommand("git", args, { cwd: repo });
  const releases = new Map();
  let failPush = true;
  try {
    await runCommand("git", ["init", "--bare", path.join(tmp, "remote.git")]);
    await git(["init", "-b", "main"]);
    await git(["config", "core.autocrlf", "true"]);
    await writeFile(path.join(repo, "README.md"), "Fixture\n");
    await git(["add", "README.md"]);
    await git([
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-m",
      "chore(test): initialize fixture",
    ]);
    await git(["remote", "add", "origin", path.join(tmp, "remote.git")]);
    await git(["push", "-u", "origin", "main"]);
    const sourceCommit = (await git(["rev-parse", "HEAD"])).toString().trim();
    const run = async (command, args) => {
      if (command === "git") {
        if (args[0] === "worktree" && args[1] === "add")
          assert.equal(args[3], path.join(repo, ".worktree", "published"));
        if (args.includes("push") && failPush) {
          failPush = false;
          throw new Error("injected push failure");
        }
        return git(args);
      }
      const action = args[1],
        tag = args[2];
      const release = releases.get(tag);
      if (action === "view") {
        if (!release) throw new Error("release not found");
        return Buffer.from(
          JSON.stringify({
            assets: [...release.assets.keys()].map((name) => ({ name })),
            isDraft: release.isDraft,
            targetCommitish: sourceCommit,
          }),
        );
      }
      if (action === "create") {
        assert.equal(
          releases.has(tag),
          false,
          "concurrent workers create only one draft",
        );
        releases.set(tag, { assets: new Map(), isDraft: true });
        return Buffer.alloc(0);
      }
      if (action === "upload") {
        const file = args[3];
        release.assets.set(path.basename(file), await readFile(file));
        return Buffer.alloc(0);
      }
      if (action === "download") {
        const directory = args[args.indexOf("--dir") + 1];
        const name = args[args.indexOf("--pattern") + 1];
        await writeFile(path.join(directory, name), release.assets.get(name));
        return Buffer.alloc(0);
      }
      if (action === "edit") {
        release.isDraft = false;
        return Buffer.alloc(0);
      }
      throw new Error("unexpected command");
    };
    const candidate = buildCatalog([makeCandidate()]);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pin = publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
    const signature = signRoot(candidate.rootBytes, {
      privateKey,
      expectedPublicKey: pin,
      keyId: "openscience-skills-test",
    });
    const github = githubStore({
      repository: "test/repo",
      revision: candidate.root.revision,
      sourceCommit,
      temporary: path.join(tmp, "transport"),
      candidate,
      repositoryRoot: repo,
      run,
    });
    const cdn = await directoryStore(path.join(tmp, "cdn"));
    await assert.rejects(
      publishSnapshot({ candidate, signature, pin, github, cdn }),
      /injected push failure/,
    );
    assert.equal(
      (await git(["worktree", "list", "--porcelain"]))
        .toString()
        .includes(path.join(".worktree", "published")),
      false,
    );
    await publishSnapshot({ candidate, signature, pin, github, cdn });
    const before = (await git(["rev-parse", "origin/published"])).toString();
    await publishSnapshot({ candidate, signature, pin, github, cdn });
    assert.equal(
      (await git(["rev-parse", "origin/published"])).toString(),
      before,
    );
    assert.equal(releases.size, 1);
    assert.deepEqual((await github.readRoot()).rootBytes, candidate.rootBytes);
    const { publishedMetadata, loadPublishedCatalog } =
      await import("../scripts/lib/published-history.mjs");
    const state = await github.readRoot();
    const metadata = publishedMetadata(state, repo);
    assert(metadata.get("marketplace.json").equals(candidate.rootBytes));
    assert([...metadata.keys()].every((p) => !p.endsWith(".zip")));
    const restored = await loadPublishedCatalog({
      state,
      pin,
      metadata,
      readArtifact: github.read,
    });
    assert.equal(restored.artifactDownloads, 1);
    assert(restored.candidate.rootBytes.equals(candidate.rootBytes));
    assert.deepEqual(restored.candidate.objects, candidate.objects);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
