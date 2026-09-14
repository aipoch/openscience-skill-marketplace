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
      putImmutable: async (p) => writes.push(p),
      writeAuditCatalog: async (bytes) => {
        assert.equal(writes.length, 430);
        const { catalog, signature } = JSON.parse(bytes);
        assert.ok(verifyRoot(jsonBytes(catalog), signature, expectedPublicKey));
        assert.equal(catalog.catalog_revision, root.revision);
      },
    },
  });
  assert.deepEqual(jsonBytes(root), before);
});
