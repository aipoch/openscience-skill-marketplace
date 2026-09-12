import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
test("CDN transport uses conditional immutable writes and verifies the public bytes", async () => {
  const { s3Store } = await import("../scripts/lib/transports.mjs");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "skill-s3-test-"));
  const objects = new Map();
  const commands = [];
  try {
    const store = s3Store({
      bucket: "test-bucket",
      baseUrl: "https://cdn.example.com/open-science/skill-marketplace/v1/",
      prefix: "open-science/skill-marketplace/v1",
      temporary: tmp,
      run: async (command, args) => {
        commands.push([command, args]);
        const key = args[args.indexOf("--key") + 1];
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
    assert.ok(commands[0][1].includes("--if-none-match"));
    assert.ok(commands[0][1].includes("*"));
  } finally {
    await rm(tmp, { recursive: true, force: true });
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
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
