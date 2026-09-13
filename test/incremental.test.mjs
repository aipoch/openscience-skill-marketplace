import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { buildCatalog } from "../scripts/lib/build.mjs";
import { publishSnapshot } from "../scripts/lib/publish.mjs";
import { publicationDelta } from "../scripts/lib/incremental.mjs";
import { publicationParent } from "../scripts/lib/published-history.mjs";
import { signRoot } from "../scripts/lib/signing.mjs";
import { jsonBytes } from "../scripts/lib/common.mjs";
import { makeCandidate } from "./fixtures.mjs";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pin = publicKey
  .export({ type: "spki", format: "der" })
  .toString("base64");
const sign = (bytes) =>
  signRoot(bytes, {
    privateKey,
    expectedPublicKey: pin,
    keyId: "openscience-skills-incremental-test",
  });
const signed = (c) => ({ ...c, signature: sign(c.rootBytes) });
function store(history, emptyRelease = false) {
  const objects = new Map(emptyRelease ? [] : history.objects);
  let rootBytes = history.rootBytes,
    signatureBytes = jsonBytes(history.signature);
  const reads = [],
    writes = [];
  return {
    objects,
    reads,
    writes,
    async read(p) {
      reads.push(p);
      return objects.get(p);
    },
    async putImmutable(p, b) {
      if (objects.has(p)) assert(objects.get(p).equals(b));
      objects.set(p, b);
      writes.push(p);
    },
    async readRoot() {
      return { rootBytes, signatureBytes };
    },
    async writeRootSignature(b) {
      signatureBytes = b;
    },
    async writeRoot(b) {
      rootBytes = b;
    },
  };
}

test("a 364-to-383 publication stages 23 CDN objects and preserves complete GitHub fallback", async () => {
  const inputs = Array.from({ length: 383 }, (_, i) =>
    makeCandidate(`fixture-${i}`),
  );
  const history = signed(buildCatalog(inputs.slice(0, 364)));
  const candidate = buildCatalog(inputs, {
    history: history.objects,
    previousRoot: history.root,
  });
  const github = store(history, true),
    cdn = store(history);
  const result = await publishSnapshot({
    candidate,
    signature: sign(candidate.rootBytes),
    pin,
    history,
    github,
    cdn,
  });
  assert.equal(publicationDelta(candidate, history, pin).size, 21);
  assert.equal(result.cdnObjects, 23); // 19 details, one ZIP, one index, and the snapshot pair.
  assert.equal(result.objects, candidate.objects.size + 2);
  assert.equal(result.reusedObjects, 367); // 364 descriptors and three historical ZIPs.
  assert.equal(cdn.writes.length, 23);
  assert(
    cdn.reads.every((p) => !history.objects.has(p)),
    "no remote historical CDN reads",
  );
  assert.equal(github.writes.length, candidate.objects.size + 2);
  for (const [p, bytes] of candidate.objects)
    assert(github.objects.get(p).equals(bytes));
  for (const mirror of [github, cdn])
    assert((await mirror.readRoot()).rootBytes.equals(candidate.rootBytes));
  const readsBefore = github.reads.length;
  await publishSnapshot({
    candidate,
    signature: sign(candidate.rootBytes),
    pin,
    history,
    github,
    cdn,
  });
  assert.equal(
    github.reads.length - readsBefore,
    candidate.objects.size + 2,
    "existing assets read only once on retry",
  );
});

test("incremental writes and split root promotion resume without rescanning old objects", async () => {
  const history = signed(buildCatalog([makeCandidate("alpha")]));
  const candidate = buildCatalog(
    [makeCandidate("alpha"), makeCandidate("beta")],
    { history: history.objects, previousRoot: history.root },
  );
  const signature = sign(candidate.rootBytes);
  const count =
    candidate.objects.size + publicationDelta(candidate, history, pin).size + 8;
  for (let interrupt = 1; interrupt <= count; interrupt++) {
    const github = store(history, true),
      cdn = store(history);
    let writes = 0;
    const wrap = (s) =>
      Object.fromEntries(
        Object.entries(s).map(([k, v]) => [
          k,
          ["putImmutable", "writeRootSignature", "writeRoot"].includes(k)
            ? async (...args) => {
                await v(...args);
                if (++writes === interrupt) throw new Error("interrupted");
              }
            : v,
        ]),
      );
    await assert.rejects(
      publishSnapshot({
        candidate,
        history,
        signature,
        pin,
        github: wrap(github),
        cdn: wrap(cdn),
      }),
      /interrupted/,
    );
    await publishSnapshot({
      candidate,
      history,
      signature,
      pin,
      github,
      cdn,
    });
    assert((await github.readRoot()).rootBytes.equals(candidate.rootBytes));
    assert((await cdn.readRoot()).rootBytes.equals(candidate.rootBytes));
    assert(cdn.reads.every((p) => !history.objects.has(p)));
  }
});

test("a signed parent is required and conflicts are not treated as reusable history", async () => {
  const history = signed(buildCatalog([makeCandidate("alpha")]));
  const candidate = buildCatalog(
    [makeCandidate("alpha"), makeCandidate("beta")],
    { history: history.objects, previousRoot: history.root },
  );
  assert.throws(
    () => publicationDelta(candidate, undefined, pin),
    /signed parent/,
  );
  assert.throws(
    () =>
      publicationDelta(
        candidate,
        { ...history, signature: { ...history.signature, signature: "bad" } },
        pin,
      ),
    /untrusted/,
  );
  const removed = buildCatalog([makeCandidate("beta")], {
    previousRoot: history.root,
  });
  assert.throws(
    () => publicationDelta(removed, history, pin),
    /historical object changed/,
  );
  const alien = signed(buildCatalog([makeCandidate("alien")]));
  assert.throws(() => publicationDelta(candidate, alien, pin), /signed parent/);
  const github = store(history),
    cdn = store(history);
  const changed = [...publicationDelta(candidate, history, pin).keys()][0];
  cdn.objects.set(changed, Buffer.from("conflict"));
  await assert.rejects(
    publishSnapshot({
      candidate,
      history,
      signature: sign(candidate.rootBytes),
      pin,
      github,
      cdn,
    }),
    /immutable/,
  );
  await assert.rejects(
    publishSnapshot({
      candidate,
      history,
      signature: sign(candidate.rootBytes),
      pin,
      github,
      cdn: { ...cdn, readRoot: async () => undefined },
    }),
    /missing published mirror history/,
  );
});

test("recovery uses the immutable signed parent even after GitHub has promoted the candidate", async () => {
  const history = signed(buildCatalog([makeCandidate("alpha")]));
  const candidate = buildCatalog(
    [makeCandidate("alpha"), makeCandidate("beta")],
    { history: history.objects, previousRoot: history.root },
  );
  const metadata = new Map(history.objects);
  metadata.set(
    `snapshots/${history.root.revision}/marketplace.json`,
    history.rootBytes,
  );
  metadata.set(
    `snapshots/${history.root.revision}/marketplace.json.sig`,
    jsonBytes(history.signature),
  );
  const parent = await publicationParent(candidate, metadata, pin);
  assert.equal(parent.root.revision, history.root.revision);
  assert.equal(publicationDelta(candidate, parent, pin).size, 3);
  metadata.set(
    `snapshots/${history.root.revision}/marketplace.json.sig`,
    Buffer.from("{}"),
  );
  await assert.rejects(
    publicationParent(candidate, metadata, pin),
    /independent pin/,
  );
});

test("history cache avoids object downloads and cache misses fetch only unique ZIPs", async () => {
  const { loadPublishedCatalog } =
    await import("../scripts/lib/published-history.mjs");
  const old = signed(
    buildCatalog([makeCandidate("alpha"), makeCandidate("beta")]),
  );
  const state = {
    rootBytes: old.rootBytes,
    signatureBytes: jsonBytes(old.signature),
  };
  const metadata = new Map(
    [...old.objects].filter(([p]) => !p.endsWith(".zip")),
  );
  const cached = await loadPublishedCatalog({
    state,
    pin,
    cached: old,
    metadata,
    readArtifact: () => {
      throw new Error("historical download forbidden");
    },
  });
  assert.equal(cached.cached, true);
  assert.equal(cached.artifactDownloads, 0);
  await assert.rejects(
    loadPublishedCatalog({
      state: {
        ...state,
        rootBytes: Buffer.concat([state.rootBytes, Buffer.from(" ")]),
      },
      pin,
      cached: old,
      metadata,
      readArtifact: () =>
        assert.fail("an invalid raw signature cannot use the cache"),
    }),
    /independent pin/,
  );
  const calls = [];
  const cold = await loadPublishedCatalog({
    state,
    pin,
    metadata,
    readArtifact: async (p) => {
      calls.push(p);
      return old.objects.get(p);
    },
  });
  assert.equal(cold.cached, false);
  assert.equal(cold.artifactDownloads, 1);
  assert.equal(calls.length, 1);
  const corrupt = { ...old, objects: new Map(old.objects) };
  corrupt.objects.set(old.root.release_index.path, Buffer.from("{}"));
  await assert.rejects(
    loadPublishedCatalog({
      state,
      pin,
      cached: corrupt,
      metadata,
      readArtifact: () => {
        throw new Error("unexpected download");
      },
    }),
    /index/,
  );
  const absent = new Map(metadata);
  absent.delete("releases/alpha/1.0.0.json");
  await assert.rejects(
    loadPublishedCatalog({
      state,
      pin,
      metadata: absent,
      readArtifact: () => {
        throw new Error("unexpected download");
      },
    }),
    /missing published metadata/,
  );
});

test("publication bounds concurrent uploads and drains failures before returning without promotion", async () => {
  const candidate = buildCatalog(
    Array.from({ length: 8 }, (_, i) => makeCandidate(`parallel-${i}`)),
  );
  const base = store(signed(candidate), true);
  let initialized = false,
    active = 0,
    peak = 0,
    failed = false;
  let allEntered;
  const entered = new Promise((resolve) => {
    allEntered = resolve;
  });
  const workers = [];
  const github = {
    ...base,
    async putImmutable(p, bytes) {
      if (!initialized) {
        initialized = true;
        return base.putImmutable(p, bytes);
      }
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise((resolve, reject) => {
          workers.push({ resolve, reject });
          if (workers.length === 4) allEntered();
        });
        await base.putImmutable(p, bytes);
      } finally {
        active--;
      }
    },
    async writeRoot() {
      assert.fail("failed uploads cannot promote the root");
    },
  };
  const cdn = store(signed(candidate), true);
  const attempt = publishSnapshot({
    candidate,
    signature: sign(candidate.rootBytes),
    pin,
    github,
    cdn,
  });
  const checked = assert.rejects(attempt, /upload failed/).then(() => {
    failed = true;
  });
  await entered;
  workers[0].reject(new Error("upload failed"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    failed,
    false,
    "outstanding uploads must drain before caller cleanup",
  );
  assert.equal(active, 3);
  for (const worker of workers.slice(1)) worker.resolve();
  await checked;
  assert.equal(active, 0);
  assert.equal(peak, 4);
  assert.equal(workers.length, 4, "failure stops taking further work");
  assert.equal(cdn.writes.length, 0);
});
