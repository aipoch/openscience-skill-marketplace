import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { assertPath, assertHttps, sha256 } from "./common.mjs";
import { directoryStore } from "./publish.mjs";
const execute = promisify(execFile);
export async function runCommand(command, args, options = {}) {
  return (
    await execute(command, args, {
      encoding: "buffer",
      maxBuffer: 300 * 1024 * 1024,
      ...options,
    })
  ).stdout;
}
export const assetName = (relative) =>
  `${sha256(Buffer.from(assertPath(relative)))}${relative.endsWith(".zip") ? ".zip" : relative.endsWith(".sig") ? ".sig" : ".json"}`;
const missing = (e) =>
  /HTTP 404|release not found|Not Found/.test(String(e.stderr ?? e.message));
export async function fetchBytes(
  url,
  { fetchImpl = fetch, maxBytes = 64 * 1024 * 1024 } = {},
) {
  const response = await fetchImpl(url, {
    redirect: "error",
    signal: AbortSignal.timeout(120000),
    headers: { "Cache-Control": "no-cache" },
  });
  if (response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`download failed: HTTP ${response.status}`);
  }
  const chunks = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > maxBytes) throw new Error("download exceeds byte limit");
      chunks.push(Buffer.from(next.value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks, length);
}

export function s3Store({
  bucket,
  baseUrl,
  prefix,
  temporary,
  run = runCommand,
  fetchImpl = fetch,
}) {
  const base = assertHttps(baseUrl);
  if (!base.pathname.endsWith("/"))
    throw new Error("CDN base URL needs a trailing slash");
  assertPath(prefix);
  if (!bucket || !/^[a-z0-9.-]+$/.test(bucket))
    throw new Error("invalid bucket");
  if (base.pathname !== `/${prefix}/`)
    throw new Error("CDN URL path must equal storage prefix");
  const read = (relative, { maxBytes = 64 * 1024 * 1024 } = {}) => {
    assertPath(relative);
    return fetchBytes(new URL(relative, base), { fetchImpl, maxBytes });
  };
  async function upload(relative, bytes, immutable) {
    assertPath(relative);
    await mkdir(temporary, { recursive: true });
    const file = path.join(temporary, assetName(relative));
    await writeFile(file, bytes);
    const args = [
      "s3api",
      "put-object",
      "--bucket",
      bucket,
      "--key",
      `${prefix}/${relative}`,
      "--body",
      file,
      "--content-type",
      relative.endsWith(".zip") ? "application/zip" : "application/json",
      "--cache-control",
      immutable ? "public,max-age=31536000,immutable" : "no-cache",
    ];
    if (immutable) args.push("--if-none-match", "*");
    try {
      await run("aws", args);
    } catch (e) {
      if (
        !immutable ||
        !/412|PreconditionFailed/.test(String(e.stderr ?? e.message))
      )
        throw e;
      const existing = await read(relative);
      if (!existing?.equals(bytes))
        throw new Error(`immutable CDN conflict: ${relative}`);
    }
  }
  return {
    read,
    putImmutable: (p, b) => upload(p, b, true),
    writeRootSignature: (b) => upload("marketplace.json.sig", b, false),
    writeRoot: (b) => upload("marketplace.json", b, false),
    async readRoot() {
      const rootBytes = await read("marketplace.json");
      return rootBytes
        ? { rootBytes, signatureBytes: await read("marketplace.json.sig") }
        : undefined;
    },
  };
}

export async function publishedState({ run = runCommand } = {}) {
  const refs = (
    await run("git", ["ls-remote", "--heads", "origin", "published"])
  )
    .toString()
    .trim();
  if (!refs) return undefined;
  await run("git", [
    "fetch",
    "origin",
    "published:refs/remotes/origin/published",
  ]);
  const commit = (await run("git", ["rev-parse", "origin/published"]))
    .toString()
    .trim();
  const rootBytes = await run("git", ["show", `${commit}:marketplace.json`]);
  const signatureBytes = await run("git", [
    "show",
    `${commit}:marketplace.json.sig`,
  ]);
  return { rootBytes, signatureBytes, commit };
}

export function githubStore({
  repository,
  revision,
  sourceCommit,
  temporary,
  candidate,
  repositoryRoot = process.cwd(),
  signatureBytes,
  baseRevision,
  run = runCommand,
}) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !/^[a-f0-9]{64}$/.test(revision)
  )
    throw new Error("invalid GitHub snapshot destination");
  const tag = `catalog-${revision}`;
  let release;
  let inspected = false;
  const gh = (args) => run("gh", [...args, "--repo", repository]);
  async function inspect() {
    if (inspected) return;
    try {
      release = JSON.parse(
        await gh([
          "release",
          "view",
          tag,
          "--json",
          "assets,isDraft,targetCommitish",
        ]),
      );
    } catch (e) {
      if (!missing(e)) throw e;
    }
    inspected = true;
  }
  async function read(relative, { maxBytes = 64 * 1024 * 1024 } = {}) {
    await inspect();
    const name = assetName(relative);
    const asset = release?.assets.find((a) => a.name === name);
    if (!asset) return undefined;
    if (asset.size > maxBytes)
      throw new Error("GitHub asset exceeds byte limit");
    const directory = path.join(
      temporary,
      "download",
      sha256(Buffer.from(relative)),
    );
    await mkdir(directory, { recursive: true });
    await gh([
      "release",
      "download",
      tag,
      "--pattern",
      name,
      "--dir",
      directory,
      "--clobber",
    ]);
    const file = path.join(directory, name);
    if ((await stat(file)).size > maxBytes)
      throw new Error("GitHub asset exceeds byte limit");
    return readFile(file);
  }
  return {
    read,
    async putImmutable(relative, bytes) {
      await inspect();
      if (!release) {
        if (!/^[a-f0-9]{40}$/.test(sourceCommit))
          throw new Error("publication requires exact source commit");
        await gh([
          "release",
          "create",
          tag,
          "--draft",
          "--target",
          sourceCommit,
          "--title",
          `Skill catalog ${revision}`,
          "--notes",
          "Immutable OpenScience Skill catalog snapshot.",
        ]);
        release = { assets: [], isDraft: true, targetCommitish: sourceCommit };
      }
      const old = await read(relative);
      if (old) {
        if (!old.equals(bytes))
          throw new Error("immutable GitHub asset conflict");
        return;
      }
      if (!release.isDraft)
        throw new Error(
          "published snapshot has missing assets; do not mutate an immutable release",
        );
      const name = assetName(relative);
      const file = path.join(temporary, "upload", name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
      await gh(["release", "upload", tag, file]);
      release.assets.push({ name });
    },
    async writeRootSignature(bytes) {
      signatureBytes = bytes;
    },
    async writeRoot(rootBytes) {
      if (!candidate || !signatureBytes)
        throw new Error("missing publication context");
      await inspect();
      if (release.isDraft) {
        await gh(["release", "edit", tag, "--draft=false", "--latest=false"]);
        release.isDraft = false;
      }
      const state = await publishedState({ run });
      if (state) {
        const current = JSON.parse(state.rootBytes).revision;
        if (
          current !== revision &&
          current !== baseRevision &&
          current !== candidate.root.previous_revision
        )
          throw new Error("published root changed before promotion");
      }
      const worktree = path.resolve(repositoryRoot, ".worktree/published");
      await run("git", [
        "worktree",
        "add",
        "--detach",
        worktree,
        state?.commit ?? "HEAD",
      ]);
      let createdBranch = false;
      let committed = false;
      try {
        if (!state) {
          await run("git", ["-C", worktree, "switch", "--orphan", "published"]);
          createdBranch = true;
        }
        const files = new Map(candidate.objects);
        files.set(`snapshots/${revision}/marketplace.json`, rootBytes);
        files.set(`snapshots/${revision}/marketplace.json.sig`, signatureBytes);
        files.set("marketplace.json", rootBytes);
        files.set("marketplace.json.sig", signatureBytes);
        const metadataStore = await directoryStore(worktree);
        await metadataStore.putImmutable(
          ".gitattributes",
          Buffer.from("* -text\n"),
        );
        for (const [relative, bytes] of files) {
          if (
            relative.endsWith(".zip") ||
            relative === "marketplace.json" ||
            relative === "marketplace.json.sig"
          )
            continue;
          await metadataStore.putImmutable(relative, bytes);
        }
        await metadataStore.writeRootSignature(signatureBytes);
        await metadataStore.writeRoot(rootBytes);
        await run("git", [
          "-C",
          worktree,
          "add",
          ".gitattributes",
          "marketplace.json",
          "marketplace.json.sig",
          "releases",
          "indexes",
          "snapshots",
        ]);
        const changed =
          (
            await run("git", [
              "-C",
              worktree,
              "diff",
              "--cached",
              "--name-only",
            ])
          ).length > 0;
        if (changed) {
          await run("git", [
            "-C",
            worktree,
            "-c",
            "user.name=github-actions[bot]",
            "-c",
            "user.email=41898282+github-actions[bot]@users.noreply.github.com",
            "commit",
            "-m",
            "feat(publishing): publish skill catalog snapshot",
          ]);
          committed = true;
          await run("git", [
            "-C",
            worktree,
            "-c",
            "credential.helper=",
            "-c",
            "credential.helper=!gh auth git-credential",
            "push",
            "origin",
            "HEAD:published",
          ]);
        }
      } finally {
        await run("git", ["worktree", "remove", "--force", worktree]);
        if (createdBranch && committed)
          await run("git", ["branch", "-D", "published"]);
      }
    },
    readRoot: () => publishedState({ run }),
  };
}
