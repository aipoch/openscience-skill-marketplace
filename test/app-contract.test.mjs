import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { categories } from "../scripts/lib/catalog.mjs";
import { buildCatalog, loadCatalog } from "../scripts/lib/build.mjs";
import { readBundle, writeBundle } from "../scripts/lib/bundle.mjs";
import { toAppEntry, validateDocument } from "../scripts/lib/protocol.mjs";
import { signRoot, verifyRoot } from "../scripts/lib/signing.mjs";
import { jsonBytes } from "../scripts/lib/common.mjs";
import { makeCandidate } from "./fixtures.mjs";

// Pinned to Open Science 9b37d9c57, skill-marketplace-model.ts.
// These are category values, not translation strings or slug aliases.
const appCategories = [
  "Academic Writing",
  "Data Analysis",
  "Evidence Insight",
  "Protocol Design",
  "Other",
];

test("listing and detail project every App category and preserve independent metadata roles", () => {
  assert.deepEqual(categories, appCategories);
  for (const category of appCategories) {
    const candidate = makeCandidate();
    Object.assign(candidate.skill, {
      category,
      version: "3.2.1",
      display_name: "A display title",
      authors: [
        { name: "Content author", url: "https://authors.example/profile" },
      ],
      evaluation: {
        kind: "upstream-self-assessment",
        score: 89,
        max_score: 100,
        report_url: `${candidate.skill.source.repository}/blob/${candidate.skill.source.commit}/${candidate.skill.source.path}/report.json`,
        evaluated_on: "2026-09-12",
        evaluator_version: "7.0.0",
        skill_version: "2.0.0",
        static_score: { score: 91, max_score: 100 },
        dynamic_score: { score: 88.4, max_score: 100 },
      },
    });
    candidate.skill.source.upstream_version = "upstream-v12";
    const built = buildCatalog([candidate]);
    const listing = built.root.skills[0];
    const descriptor = validateDocument(
      "skill-release",
      JSON.parse(built.objects.get(listing.release.path)),
    );
    const original = structuredClone({ listing, descriptor });
    const expected = {
      id: "example",
      displayName: "A display title",
      summary: "Test-only fixture",
      category,
      version: "3.2.1",
      authors: [
        { name: "Content author", url: "https://authors.example/profile" },
      ],
      publisher: { name: "Test fixture", url: "https://example.com" },
      source: {
        repository: "https://github.com/test/source",
        commit: "a".repeat(40),
        path: "skills/example",
      },
      license: "MIT",
      evaluation: {
        kind: "upstream-self-assessment",
        score: 89,
        maxScore: 100,
        reportUrl: candidate.skill.evaluation.report_url,
        evaluatedOn: "2026-09-12",
        evaluatorVersion: "7.0.0",
        skillVersion: "2.0.0",
        staticScore: { score: 91, maxScore: 100 },
        dynamicScore: { score: 88.4, maxScore: 100 },
      },
    };
    assert.deepEqual(toAppEntry(listing), expected);
    assert.deepEqual(toAppEntry(descriptor.skill), expected);
    // Distribution locations and full evidence stay in the authenticated catalog,
    // independently of the smaller browsing projection.
    assert.equal(descriptor.skill.source.upstream_version, "upstream-v12");
    assert.deepEqual({ listing, descriptor }, original);
    delete candidate.skill.evaluation.skill_version;
    const unversioned = buildCatalog([candidate]).root.skills[0];
    assert.equal("skillVersion" in toAppEntry(unversioned).evaluation, false);
    delete candidate.skill.evaluation;
    delete candidate.skill.authors;
    const unscored = buildCatalog([candidate]);
    const plainListing = unscored.root.skills[0];
    const plainDetail = JSON.parse(
      unscored.objects.get(plainListing.release.path),
    );
    for (const input of [plainListing, plainDetail.skill]) {
      const app = toAppEntry(input);
      assert.equal(app.category, category);
      assert.equal("authors" in app, false);
      assert.equal("evaluation" in app, false);
    }
  }
});

test("real-source listing and detail fixtures match the App projection without importing mock defaults", async () => {
  const bundle = await readBundle("protocol/fixtures/snapshot");
  for (const listing of bundle.root.skills) {
    const descriptor = validateDocument(
      "skill-release",
      JSON.parse(bundle.objects.get(listing.release.path)),
    );
    const app = toAppEntry(listing);
    assert.deepEqual(toAppEntry(descriptor.skill), app);
    assert.equal(app.category, listing.category);
    assert.equal(app.summary, descriptor.skill.summary);
    assert.equal(app.license, descriptor.skill.license.expression);
    assert.ok(descriptor.skill.license.evidence.length > 0);
    assert.deepEqual(app.source, {
      repository: "https://github.com/aipoch/medical-research-skills",
      commit: "d92441066ea6259967469be8e0c8c7b6587928ab",
      path: descriptor.skill.source.path,
    });
    assert.ok(app.source.path);
    assert.equal(app.publisher.url, "https://aipoch.com/agent-skills");
    assert.notEqual(app.source.repository, app.publisher.url);
    assert.deepEqual(app.authors, descriptor.skill.authors);
    for (const field of [
      "author",
      "description",
      "enabled",
      "activationPolicy",
      "inclusionTier",
      "inclusion_tier",
    ])
      assert.equal(field in app, false);
    if (listing.id === "primary-plan-recommender") {
      assert.equal(app.evaluation.score, 89);
      assert.equal(app.evaluation.maxScore, 100);
      assert.equal(
        app.evaluation.reportUrl,
        descriptor.skill.evaluation.report_url,
      );
      assert.equal(app.evaluation.dynamicScore.score, 88.4);
      assert.equal("skillVersion" in app.evaluation, false);
    } else assert.equal("evaluation" in app, false);
  }
  const unscored = buildCatalog([makeCandidate("no-author")]);
  const listing = unscored.root.skills[0];
  const detail = JSON.parse(unscored.objects.get(listing.release.path));
  for (const input of [listing, detail.skill]) {
    const app = toAppEntry(input);
    assert.equal("authors" in app, false);
    assert.equal("evaluation" in app, false);
  }
});

test("App boundary rejects old categories, camelCase wire fields, tiers and installed source values", () => {
  const built = buildCatalog([makeCandidate()]);
  const listing = built.root.skills[0];
  const detail = JSON.parse(built.objects.get(listing.release.path));
  const missingEvidence = structuredClone(detail.skill);
  missingEvidence.license.evidence = [];
  assert.throws(() => toAppEntry(missingEvidence), /schema/);
  for (const input of [listing, detail.skill]) {
    for (const category of [
      "academic-writing",
      "data-analysis",
      "evidence-insight",
      "protocol-design",
      "other",
    ])
      assert.throws(() => toAppEntry({ ...input, category }), /schema/);
    for (const field of [
      "displayName",
      "inclusion_tier",
      "inclusionTier",
      "author",
      "description",
    ])
      assert.throws(() => toAppEntry({ ...input, [field]: "old" }), /schema/);
    const old = { ...input, displayName: input.display_name };
    delete old.display_name;
    assert.throws(() => toAppEntry(old), /schema/);
    for (const source of ["featured", "imported", "personal"])
      assert.throws(() => toAppEntry({ ...input, source }), /schema/);
    const missingPath = structuredClone(input);
    delete missingPath.source.path;
    assert.throws(() => toAppEntry(missingPath), /schema/);
    const missingLicense = structuredClone(input);
    delete missingLicense.license;
    assert.throws(() => toAppEntry(missingLicense), /schema/);
    const missingSummary = structuredClone(input);
    delete missingSummary.summary;
    assert.throws(() => toAppEntry(missingSummary), /schema/);
    assert.throws(() => toAppEntry({ ...input, evaluation: null }), /schema/);
    assert.throws(
      () =>
        toAppEntry({
          ...input,
          evaluation: {
            kind: "upstream-self-assessment",
            score: 89,
            maxScore: 100,
            reportUrl: "https://example.com/report.json",
          },
        }),
      /schema/,
    );
  }
});

test("authentication checks original bytes before App mapping or JSON normalization", async (t) => {
  const bundle = await readBundle("protocol/fixtures/snapshot");
  const directory = await mkdtemp(join(tmpdir(), "skill-app-contract-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeBundle(directory, bundle);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pin = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  // Sign a valid document with a different layout to catch premature normalization.
  const raw = Buffer.from(JSON.stringify(bundle.root));
  const signature = signRoot(raw, {
    privateKey,
    expectedPublicKey: pin,
    keyId: "openscience-skills-app-contract",
  });
  assert.equal(verifyRoot(raw, signature, pin), true);
  assert.equal(verifyRoot(jsonBytes(JSON.parse(raw)), signature, pin), false);
  await writeFile(join(directory, "marketplace.json"), raw);
  await writeFile(
    join(directory, "marketplace.json.sig"),
    jsonBytes(signature),
  );
  const authenticated = await readBundle(directory, { pin });
  assert.equal(
    toAppEntry(authenticated.root.skills[0]).category,
    authenticated.root.skills[0].category,
  );
  await writeFile(
    join(directory, "marketplace.json"),
    jsonBytes(JSON.parse(raw)),
  );
  await assert.rejects(readBundle(directory, { pin }), /signature/);
  const releasePath = bundle.root.skills[0].release.path;
  await assert.rejects(
    loadCatalog(bundle.rootBytes, async (path) =>
      path === releasePath
        ? Buffer.from(JSON.stringify(JSON.parse(bundle.objects.get(path))))
        : bundle.objects.get(path),
    ),
    /digest/,
  );
});
