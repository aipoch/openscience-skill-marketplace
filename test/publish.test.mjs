import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { makeCandidate } from "./fixtures.mjs";
import { buildCatalog } from "../scripts/lib/build.mjs";
import { signRoot } from "../scripts/lib/signing.mjs";

test("publication reconciles byte-identical objects after every interrupted write and never promotes corrupt mirrors", async () => {
  const { publishSnapshot, directoryStore } =
    await import("../scripts/lib/publish.mjs");
  const candidate = buildCatalog([makeCandidate()]);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pin = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const signature = signRoot(candidate.rootBytes, {
    privateKey,
    expectedPublicKey: pin,
    keyId: "openscience-skills-test",
  });
  for (
    let interrupt = 1;
    interrupt <= 2 * (candidate.objects.size + 2) + 4;
    interrupt++
  ) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "skill-publish-test-"));
    try {
      const github = await directoryStore(path.join(tmp, "github")),
        cdn = await directoryStore(path.join(tmp, "cdn"));
      let writes = 0;
      const wrap = (store) => ({
        ...store,
        async putImmutable(p, b) {
          await store.putImmutable(p, b);
          if (++writes === interrupt) throw new Error("power loss");
        },
        async writeRootSignature(b) {
          await store.writeRootSignature(b);
          if (++writes === interrupt) throw new Error("power loss");
        },
        async writeRoot(b) {
          await store.writeRoot(b);
          if (++writes === interrupt) throw new Error("power loss");
        },
      });
      await assert.rejects(
        publishSnapshot({
          candidate,
          signature,
          pin,
          github: wrap(github),
          cdn: wrap(cdn),
        }),
        /power loss/,
      );
      await publishSnapshot({ candidate, signature, pin, github, cdn });
      await publishSnapshot({ candidate, signature, pin, github, cdn });
      assert.deepEqual(
        (await github.readRoot()).rootBytes,
        candidate.rootBytes,
      );
      assert.deepEqual((await cdn.readRoot()).rootBytes, candidate.rootBytes);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
  const tmp = await mkdtemp(path.join(os.tmpdir(), "skill-publish-conflict-"));
  try {
    const github = await directoryStore(path.join(tmp, "github")),
      cdn = await directoryStore(path.join(tmp, "cdn"));
    const key = [...candidate.objects.keys()][0];
    await cdn.putImmutable(key, Buffer.from("conflict"));
    await assert.rejects(
      publishSnapshot({ candidate, signature, pin, github, cdn }),
      /immutable/,
    );
    assert.equal(await cdn.readRoot(), undefined);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("a new workflow can resume when GitHub advanced but CDN still serves the previous signed snapshot", async () => {
  const { publishSnapshot, directoryStore } =
    await import("../scripts/lib/publish.mjs");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "skill-publish-resume-"));
  try {
    const github = await directoryStore(path.join(tmp, "github")),
      cdn = await directoryStore(path.join(tmp, "cdn"));
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pin = publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
    const signed = (c) =>
      signRoot(c.rootBytes, {
        privateKey,
        expectedPublicKey: pin,
        keyId: "openscience-skills-test",
      });
    const first = buildCatalog([makeCandidate("alpha")]);
    await publishSnapshot({
      candidate: first,
      signature: signed(first),
      pin,
      github,
      cdn,
    });
    const second = buildCatalog(
      [makeCandidate("alpha"), makeCandidate("beta")],
      { history: first.objects, previousRoot: first.root },
    );
    await assert.rejects(
      publishSnapshot({
        candidate: second,
        history: { ...first, signature: signed(first) },
        signature: signed(second),
        pin,
        github,
        cdn: {
          ...cdn,
          writeRoot: async () => {
            throw new Error("CDN offline");
          },
        },
        baseRevision: first.root.revision,
      }),
      /CDN offline/,
    );
    const rebuilt = buildCatalog(
      [makeCandidate("alpha"), makeCandidate("beta")],
      { history: second.objects, previousRoot: second.root },
    );
    await publishSnapshot({
      candidate: rebuilt,
      history: { ...first, signature: signed(first) },
      signature: signed(rebuilt),
      pin,
      github,
      cdn,
      baseRevision: second.root.revision,
    });
    assert.deepEqual((await cdn.readRoot()).rootBytes, second.rootBytes);
    await assert.rejects(
      publishSnapshot({
        candidate: first,
        signature: signed(first),
        pin,
        github,
        cdn,
      }),
      /stable root changed/,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
