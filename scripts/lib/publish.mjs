import { publicationDelta } from "./incremental.mjs";
import {
  mkdir,
  lstat,
  readFile,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertPath, jsonBytes, sha256 } from "./common.mjs";
import { verifyCatalog } from "./build.mjs";
import { verifyRoot } from "./signing.mjs";

export async function directoryStore(directory) {
  const root = path.resolve(directory);
  await mkdir(root, { recursive: true });
  if ((await lstat(root)).isSymbolicLink())
    throw new Error("store root cannot be a symlink");
  async function target(relative, create = false) {
    assertPath(relative);
    const parts = relative.split("/");
    let current = root;
    for (const part of parts.slice(0, -1)) {
      current = path.join(current, part);
      if (create) await mkdir(current, { recursive: true });
      try {
        const stat = await lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory())
          throw new Error("unsafe store directory");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    const file = path.join(root, ...parts);
    try {
      if ((await lstat(file)).isSymbolicLink())
        throw new Error("unsafe store file");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    return file;
  }
  async function read(relative, { maxBytes = 64 * 1024 * 1024 } = {}) {
    try {
      const file = await target(relative);
      if ((await lstat(file)).size > maxBytes)
        throw new Error("store object exceeds byte limit");
      return await readFile(file);
    } catch (e) {
      if (e.code === "ENOENT") return undefined;
      throw e;
    }
  }
  async function atomic(relative, bytes) {
    const file = await target(relative, true);
    const temporary = file + `.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    }
  }
  return {
    read,
    async putImmutable(relative, bytes) {
      const file = await target(relative, true);
      try {
        await writeFile(file, bytes, { flag: "wx" });
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        if (!(await read(relative)).equals(bytes))
          throw new Error(`immutable object conflict: ${relative}`);
      }
    },
    async writeRootSignature(bytes) {
      await atomic("marketplace.json.sig", bytes);
    },
    async writeRoot(bytes) {
      await atomic("marketplace.json", bytes);
    },
    async readRoot() {
      const rootBytes = await read("marketplace.json", {
        maxBytes: 4 * 1024 * 1024,
      });
      if (!rootBytes) return undefined;
      return {
        rootBytes,
        signatureBytes: await read("marketplace.json.sig", { maxBytes: 4096 }),
      };
    },
  };
}

export async function publishSnapshot({
  candidate,
  signature,
  pin,
  github,
  cdn,
  baseRevision,
  history,
}) {
  const root = verifyCatalog(candidate);
  if (!verifyRoot(candidate.rootBytes, signature, pin))
    throw new Error("candidate signature does not match trusted pin");
  const signatureBytes = jsonBytes(signature);
  const delta = publicationDelta(candidate, history, pin);
  for (const store of [github, cdn]) {
    const current = await store.readRoot();
    if (!current && history)
      throw new Error("missing published mirror history");
    if (current) {
      const currentRoot = JSON.parse(current.rootBytes);
      if (
        currentRoot.revision !== root.revision &&
        currentRoot.revision !== baseRevision &&
        currentRoot.revision !== root.previous_revision
      )
        throw new Error(
          "stable root changed; rebuild from current published history",
        );
      // A retry may observe the candidate signature beside the previous root after an interrupted promotion.
      if (
        !current.rootBytes.equals(candidate.rootBytes) &&
        !verifyRoot(
          current.rootBytes,
          JSON.parse(current.signatureBytes ?? "null"),
          pin,
        )
      ) {
        if (!current.signatureBytes?.equals(signatureBytes))
          throw new Error("untrusted previous root");
      }
    }
  }
  const snapshot = new Map([
    [`snapshots/${root.revision}/marketplace.json`, candidate.rootBytes],
    [`snapshots/${root.revision}/marketplace.json.sig`, signatureBytes],
  ]);
  // Existing consumers address every GitHub asset through catalog-<revision>.
  // CDN paths are shared, so only the signed parent's new objects need staging.
  for (const [store, objects] of [
    [github, candidate.objects],
    [cdn, delta],
  ]) {
    const staged = [...new Map([...objects, ...snapshot])];
    async function reconcile([name, bytes]) {
      const existing = await store.read(name);
      if (existing) {
        if (!existing.equals(bytes))
          throw new Error(`immutable object conflict: ${name}`);
        return;
      }
      await store.putImmutable(name, bytes);
      const downloaded = await store.read(name);
      if (!downloaded?.equals(bytes))
        throw new Error(`mirror verification failed: ${name}`);
    }
    // Initialize the Release before concurrent workers can upload into its draft.
    await reconcile(staged.shift());
    const pending = staged.values();
    let failure;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (const item of pending) {
          if (failure) return;
          try {
            await reconcile(item);
          } catch (error) {
            failure ??= error;
            return;
          }
        }
      }),
    );
    if (failure) throw failure;
  }
  // Both transports must expose identical immutable bytes before either stable root is moved.
  for (const store of [github, cdn]) {
    await store.writeRootSignature(signatureBytes);
    await store.writeRoot(candidate.rootBytes);
  }
  for (const store of [github, cdn]) {
    const current = await store.readRoot();
    if (
      !current?.rootBytes.equals(candidate.rootBytes) ||
      !current.signatureBytes?.equals(signatureBytes)
    )
      throw new Error("stable GitHub/CDN metadata mismatch");
  }
  return {
    revision: root.revision,
    objects: candidate.objects.size + snapshot.size,
    cdnObjects: delta.size + snapshot.size,
    reusedObjects: candidate.objects.size - delta.size,
    rootSha256: sha256(candidate.rootBytes),
  };
}
