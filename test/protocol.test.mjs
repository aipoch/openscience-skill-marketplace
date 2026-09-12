import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

test("independent Skill schema accepts optional evaluation and rejects unknown fields and invalid evidence", async () => {
  const { validateDocument } = await import("../scripts/lib/protocol.mjs");
  const skill = {
    id: "example",
    version: "1.0.0",
    display_name: "Example",
    summary: "Example Skill",
    category: "Other",
    source: {
      repository: "https://github.com/test/source",
      commit: "a".repeat(40),
      path: "skills/example",
    },
    publisher: { id: "test", name: "Test", url: "https://example.com" },
    license: {
      expression: "MIT",
      evidence: [
        {
          url: `https://github.com/test/source/blob/${"a".repeat(40)}/LICENSE`,
          sha256: "b".repeat(64),
        },
      ],
      review: { reviewed_by: "Test reviewer", reviewed_on: "2026-09-12" },
    },
  };
  const descriptor = {
    schema_version: 1,
    protocol: "openscience-skill-marketplace",
    skill,
    package: {
      content_sha256: "c".repeat(64),
      file_count: 1,
      uncompressed_bytes: 50,
    },
    artifact: {
      path: `shards/${"d".repeat(64)}.zip`,
      sha256: "d".repeat(64),
      bytes: 100,
      skill_path: "example",
    },
  };
  validateDocument("skill-release", descriptor);
  assert.throws(
    () => validateDocument("skill-release", { ...descriptor, unknown: true }),
    /schema/,
  );
  assert.throws(
    () =>
      validateDocument("skill-release", {
        ...descriptor,
        skill: { ...skill, inclusion_tier: "catalog-candidate" },
      }),
    /schema/,
  );
  const scored = structuredClone(descriptor);
  scored.skill.evaluation = {
    kind: "upstream-self-assessment",
    score: 89,
    max_score: 100,
    report_url: `https://github.com/test/source/blob/${"a".repeat(40)}/skills/example/eval_report_example_result.json`,
    dynamic_score: { score: 88.4, max_score: 100 },
  };
  validateDocument("skill-release", scored);
  scored.skill.evaluation.score = 101;
  assert.throws(() => validateDocument("skill-release", scored), /score/);
  scored.skill.evaluation.score = 89;
  scored.skill.evaluation.report_url =
    "https://github.com/test/source/blob/main/report.json";
  assert.throws(() => validateDocument("skill-release", scored), /immutable/);
});

test("signatures authenticate exact bytes with an independent pinned Ed25519 key", async () => {
  const { signRoot, verifyRoot } = await import("../scripts/lib/signing.mjs");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pin = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const bytes = Buffer.from('{"original":true}\n');
  const signed = signRoot(bytes, {
    privateKey,
    expectedPublicKey: pin,
    keyId: "openscience-skills-test",
  });
  assert.equal(verifyRoot(bytes, signed, pin), true);
  assert.equal(
    verifyRoot(Buffer.from('{"original":true}'), signed, pin),
    false,
  );
  assert.equal(verifyRoot(bytes, signed, undefined), false);
  const other = generateKeyPairSync("ed25519")
    .publicKey.export({ type: "spki", format: "der" })
    .toString("base64");
  assert.equal(verifyRoot(bytes, signed, other), false);
  assert.throws(
    () =>
      signRoot(bytes, {
        privateKey,
        expectedPublicKey: other,
        keyId: "openscience-skills-test",
      }),
    /pin/,
  );
});

test("real-source fixtures map to App fields while preserving missing evaluation and source roles", async () => {
  const { toAppEntry } = await import("../scripts/lib/protocol.mjs");
  const { readBundle } = await import("../scripts/lib/bundle.mjs");
  const bundle = await readBundle("protocol/fixtures/snapshot");
  const scored = toAppEntry(
    bundle.root.skills.find((s) => s.id === "primary-plan-recommender"),
  );
  assert.equal(scored.category, "Protocol Design");
  assert.equal("inclusionTier" in scored, false);
  assert.ok(bundle.root.skills.every((entry) => !("inclusion_tier" in entry)));
  assert.equal(scored.publisher.url, "https://aipoch.com/agent-skills");
  assert.equal(
    scored.source.repository,
    "https://github.com/aipoch/medical-research-skills",
  );
  assert.equal(scored.evaluation.maxScore, 100);
  assert.equal(scored.evaluation.dynamicScore.score, 88.4);
  assert.equal("skillVersion" in scored.evaluation, false);
  const unscored = toAppEntry(
    bundle.root.skills.find((s) => s.id === "pdf-to-ppt-pack"),
  );
  assert.equal("evaluation" in unscored, false);
});
