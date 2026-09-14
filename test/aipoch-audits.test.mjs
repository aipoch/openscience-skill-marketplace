import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, cp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import {
  buildAuditCatalog,
  reportEvaluation,
  publishAuditCatalog,
  verifyAuditEnvelope,
  parseAuditRegistry,
} from "../scripts/lib/aipoch-audits.mjs";
import { verifyRoot } from "../scripts/lib/signing.mjs";
import { jsonBytes } from "../scripts/lib/common.mjs";

const registry = JSON.parse(await readFile("audits/registry.json", "utf8"));
const root = { revision: "a".repeat(64), skills: registry.entries };

test("430 exact source-bound audits preserve the two explicit omissions", async () => {
  const { catalog, reports } = await buildAuditCatalog(root);
  assert.equal(catalog.entries.length, 430);
  assert.equal(reports.size, 430);
  assert.deepEqual(registry.excluded_ids, [
    "get-available-resources",
    "scientific-brainstorming",
  ]);
  for (const id of registry.excluded_ids)
    assert.ok(!catalog.entries.some((e) => e.id === id));
  const clinical = catalog.entries.find(
    (e) => e.id === "clinical-decision-support",
  );
  assert.equal(
    clinical.source.repository,
    "https://github.com/K-Dense-AI/scientific-agent-skills",
  );
  assert.equal(clinical.evaluation.score, 92);
  assert.equal(
    catalog.entries.find((e) => e.id === "boltz2-nim").evaluation.score,
    93,
  );
  assert.ok(
    catalog.entries.every(
      (e) =>
        e.evaluation.scope === "submitted-material" &&
        e.evaluation.auditor === "AIPOCH",
    ),
  );
});

test("same name in another repository, path, commit, version or package never receives an audit", async () => {
  for (const change of [
    (e) => {
      e.source.repository = "https://github.com/example/other";
    },
    (e) => {
      e.source.path += "-other";
    },
    (e) => {
      e.source.commit = "b".repeat(40);
    },
    (e) => {
      e.version = "2.0.0";
    },
    (e) => {
      e.content_sha256 = "b".repeat(64);
    },
  ]) {
    const entry = structuredClone(registry.entries[0]);
    change(entry);
    assert.equal(
      (await buildAuditCatalog({ ...root, skills: [entry] })).catalog.entries
        .length,
      0,
    );
  }
});

test("audit evidence corruption fails closed", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "aipoch-audit-test-"));
  try {
    await cp("audits", temp, { recursive: true });
    await writeFile(
      path.join(temp, "reports", `${registry.entries[0].report_sha256}.json`),
      "{}",
    );
    await assert.rejects(buildAuditCatalog(root, temp), /digest mismatch/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("zero is a score; invalid scores and dates are rejected", () => {
  const report = {
    meta: {
      skill_name: "test",
      evaluator_version: "skill-auditor@1.0",
      evaluated_on: "2026-09-09",
    },
    final: { score: 0, max: 100 },
  };
  assert.equal(reportEvaluation(report).score, 0);
  for (const score of [-1, 101, NaN, "93"])
    assert.throws(() =>
      reportEvaluation({ ...report, final: { score, max: 100 } }),
    );
  assert.throws(() =>
    reportEvaluation({
      ...report,
      meta: { ...report.meta, evaluated_on: "2026-02-30" },
    }),
  );
});

test("reports precede a single signed envelope without altering the install catalog", async () => {
  const before = jsonBytes(root);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const expectedPublicKey = publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
  const writes = [];
  await publishAuditCatalog({
    root,
    signing: {
      privateKey,
      expectedPublicKey,
      keyId: "openscience-skills-test",
    },
    store: {
      read: async () => undefined,
      putImmutable: async (p) => writes.push(p),
      writeAuditCatalog: async (bytes) => {
        assert.equal(writes.length, 430);
        const catalog = verifyAuditEnvelope(bytes, expectedPublicKey);
        assert.equal(catalog.catalogRevision, root.revision);
      },
    },
  });
  assert.deepEqual(jsonBytes(root), before);
});

test("registry rejects unknown/mixed fields before publishing them", async () => {
  for (const mutate of [
    (r) => {
      r.unknown = true;
    },
    (r) => {
      r.entries[0].content_sha256 = [r.entries[0].content_sha256];
    },
    (r) => {
      r.entries[0].source.commit = [r.entries[0].source.commit];
    },
    (r) => {
      r.schemaVersion = 1;
    },
    (r) => {
      r.entries[0].displayName = "unexpected";
    },
    (r) => {
      r.entries[0].extra_field = true;
    },
    (r) => {
      r.entries[0].source.extra_field = true;
    },
    (r) => {
      delete r.entries[0].report_sha256;
    },
    (r) => {
      r.entries.push(r.entries[0]);
    },
  ]) {
    const input = structuredClone(registry);
    mutate(input);
    assert.throws(() => parseAuditRegistry(jsonBytes(input)));
  }
  const parsed = parseAuditRegistry(jsonBytes(registry));
  assert.equal(
    parsed.entries[0].contentSha256,
    registry.entries[0].content_sha256,
  );
  assert.equal("content_sha256" in parsed.entries[0], false);
});

test("envelope authenticates original bytes before parsing and rejects old draft/unknown fields", async () => {
  const { signRoot } = await import("../scripts/lib/signing.mjs");
  const { metadataJsonBytes } =
    await import("../scripts/lib/metadata-json.mjs");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pin = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const signing = {
    privateKey,
    expectedPublicKey: pin,
    keyId: "openscience-skills-test",
  };
  const { catalog } = await buildAuditCatalog(root);
  // Authenticated arbitrary JSON whitespace is preserved, not normalized for verification.
  const payload = Buffer.from(
    " \n" + metadataJsonBytes(catalog).toString() + "\t",
  );
  const signature = signRoot(payload, signing);
  const envelope = { payload_base64: payload.toString("base64"), signature };
  assert.deepEqual(verifyAuditEnvelope(jsonBytes(envelope), pin), catalog);
  assert.equal(verifyRoot(metadataJsonBytes(catalog), signature, pin), false);
  assert.throws(() =>
    verifyAuditEnvelope(jsonBytes({ ...envelope, unknown: true }), pin),
  );
  assert.throws(() =>
    verifyAuditEnvelope(jsonBytes({ catalog, signature }), pin),
  );
  assert.throws(
    () => verifyAuditEnvelope(jsonBytes(envelope), "wrong-pin"),
    /signature/,
  );
  assert.throws(
    () =>
      verifyAuditEnvelope(
        jsonBytes({
          ...envelope,
          payload_base64: Buffer.from("not JSON").toString("base64"),
        }),
        pin,
      ),
    /signature/,
  );
  assert.throws(
    () =>
      verifyAuditEnvelope(
        jsonBytes({
          ...envelope,
          payload_base64: envelope.payload_base64 + "\n",
        }),
        pin,
      ),
    /signature|encoding/,
  );
  const invalid = JSON.parse(metadataJsonBytes(catalog));
  invalid.entries[0].evaluation.unexpected = true;
  const badBytes = jsonBytes(invalid);
  assert.throws(
    () =>
      verifyAuditEnvelope(
        jsonBytes({
          payload_base64: badBytes.toString("base64"),
          signature: signRoot(badBytes, signing),
        }),
        pin,
      ),
    /fields/,
  );
});

test("authenticated audit history skips unchanged reports across catalog revisions", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signing = {
    privateKey,
    expectedPublicKey: publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
    keyId: "openscience-skills-test",
  };
  let envelope,
    writes = 0,
    reads = 0;
  const store = {
    read: async (p) => {
      assert.equal(p, "audits/catalog.json");
      reads++;
      return envelope;
    },
    putImmutable: async () => {
      writes++;
    },
    writeAuditCatalog: async (bytes) => {
      envelope = bytes;
    },
  };
  const publish = (root) => publishAuditCatalog({ root, store, signing });
  const first = await publish(root);
  assert.equal(first.uploadedReports, 430);
  writes = 0;
  const second = await publish({ ...root, revision: "b".repeat(64) });
  assert.equal(writes, 0);
  assert.equal(second.reusedReports, 430);
  assert.equal(reads, 2);
  assert.equal(
    verifyAuditEnvelope(envelope, signing.expectedPublicKey).catalogRevision,
    "b".repeat(64),
  );
  envelope = Buffer.from("{}");
  await assert.rejects(publish(root), /fields/);
  assert.equal(writes, 0);
});

test("new reports alone are uploaded, and failed publication never advances trusted history", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signing = {
    privateKey,
    expectedPublicKey: publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
    keyId: "openscience-skills-test",
  };
  const objects = new Map();
  let envelope,
    fail = false;
  const writes = [];
  const store = {
    read: async () => envelope,
    putImmutable: async (p, b) => {
      writes.push(p);
      if (fail) throw Error("upload failed");
      objects.set(p, b);
    },
    writeAuditCatalog: async (b) => {
      envelope = b;
    },
  };
  const firstRoot = { ...root, skills: root.skills.slice(0, 1) };
  await publishAuditCatalog({ root: firstRoot, store, signing });
  const before = envelope;
  writes.length = 0;
  fail = true;
  const nextRoot = {
    ...root,
    revision: "c".repeat(64),
    skills: root.skills.slice(0, 2),
  };
  await assert.rejects(
    publishAuditCatalog({ root: nextRoot, store, signing }),
    /upload failed/,
  );
  assert.equal(envelope, before);
  assert.equal(writes.length, 1);
  writes.length = 0;
  fail = false;
  const result = await publishAuditCatalog({ root: nextRoot, store, signing });
  assert.equal(result.uploadedReports, 1);
  assert.equal(result.reusedReports, 1);
  assert.equal(writes.length, 1);
  assert.equal(objects.size, 2);
});
