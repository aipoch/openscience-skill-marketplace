import {
  parseMetadataJson,
  metadataJsonBytes,
} from "../scripts/lib/metadata-json.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import {
  parseReleaseConfig,
  validateReleaseConfig,
  inspectSubmission,
  prepareSubmission,
  submissionSnapshot,
} from "../scripts/lib/authoring.mjs";
import { buildCatalog, loadCatalog } from "../scripts/lib/build.mjs";
import { LIMITS } from "../scripts/lib/package.mjs";

const config = parseMetadataJson(
  readFileSync(new URL("../marketplace.config.json", import.meta.url)),
);
const manifest = () => ({
  schemaVersion: 1,
  id: "example-skill",
  version: "1.0.0",
  category: "other",
  displayName: "Example Skill",
  source: {
    repository: "https://github.com/test/skills",
    commit: "a".repeat(40),
    path: "skills/example-skill",
  },
  licenseFiles: ["LICENSE"],
});
const skillText =
  "---\nname: example-skill\ndescription: Example description\nlicense: MIT\nauthor: Test author\n---\nInstructions.\n";
function fixture(extra = []) {
  const input = new Map([
    ["skills/example-skill/SKILL.md", Buffer.from(skillText)],
    ["LICENSE", Buffer.from("Test-only license evidence")],
    ...extra,
  ]);
  return {
    files: [...input].map(([path, bytes]) => ({
      path,
      mode: "100644",
      type: "blob",
      size: bytes.length,
    })),
    read: (paths) => new Map(paths.map((path) => [path, input.get(path)])),
  };
}
function reviewed(m, snapshot) {
  return {
    [`${m.id}@${m.version}`]: {
      ...inspectSubmission(m, snapshot).reviewInput,
      reviewedBy: "Test-only reviewer",
      reviewedOn: "2026-09-12",
    },
  };
}

test("provider manifest is strict, uses existing categories/SemVer and excludes platform metadata", () => {
  validateReleaseConfig(manifest());
  parseReleaseConfig(
    readFileSync(
      new URL("../authoring/example/release.config.json", import.meta.url),
    ),
  );
  for (const field of [
    "evaluation",
    "eval_report",
    "inclusionTier",
    "collection",
    "publisher",
    "contentSha256",
  ])
    assert.throws(
      () =>
        validateReleaseConfig({ ...manifest(), [field]: "not provider input" }),
      /invalid release/,
    );
  for (const change of [
    { schemaVersion: 2 },
    { id: "Bad_ID" },
    { version: "1.0" },
    { version: "1.0.0-01" },
    { category: "new-category" },
    { displayName: "  " },
    { licenseFiles: [] },
    { licenseFiles: ["../LICENSE"] },
    { licenseFiles: ["LICENSE", "LICENSE"] },
  ])
    assert.throws(
      () => validateReleaseConfig({ ...manifest(), ...change }),
      /invalid release/,
    );
  for (const change of [
    { commit: "main" },
    { repository: "http://github.com/test/skills" },
    { path: "../skill" },
    { upstream_version: "1" },
  ])
    assert.throws(
      () =>
        validateReleaseConfig({
          ...manifest(),
          source: { ...manifest().source, ...change },
        }),
      /invalid release/,
    );
  const noVersion = manifest();
  delete noVersion.version;
  assert.throws(() => validateReleaseConfig(noVersion), /version/);
});

test("intake needs no assessment and builds deterministic reviewed packages through the existing builder", async () => {
  // Report-like files stay ordinary payloads: providers are never asked to evaluate.
  const snapshot = fixture([
    [
      "skills/example-skill/eval_report_unknown.json",
      Buffer.from("not a report"),
    ],
  ]);
  const m = manifest();
  const { entry, reviewInput } = inspectSubmission(m, snapshot);
  assert.equal(entry.authors[0].name, "Test author");
  assert.equal("evaluation" in entry, false);
  assert.equal("reviewedBy" in reviewInput, false);
  assert.throws(
    () => prepareSubmission(m, snapshot, {}, config),
    /missing maintainer review/,
  );
  const reviews = reviewed(m, snapshot);
  const candidate = prepareSubmission(m, snapshot, reviews, config);
  const first = buildCatalog([candidate], { marketplace: config.marketplace });
  const second = buildCatalog(
    [prepareSubmission(m, snapshot, reviews, config)],
    { marketplace: config.marketplace },
  );
  assert.deepEqual(first.rootBytes, second.rootBytes);
  assert.deepEqual(first.objects, second.objects);
  const loaded = await loadCatalog(first.rootBytes, async (path) =>
    first.objects.get(path),
  );
  const listing = loaded.root.skills[0];
  assert.equal(listing.display_name, "Example Skill");
  assert.equal(listing.publisher.id, "aipoch");
  assert.equal("evaluation" in listing, false);
  assert.equal(
    candidate.files.some((file) => file.path === "eval_report_unknown.json"),
    true,
  );
  delete m.displayName;
  assert.equal(inspectSubmission(m, fixture()).entry.displayName, m.id);
});

test("review binds authoring metadata, source identity, package bytes and license selection", () => {
  const m = manifest(),
    snapshot = fixture(),
    reviews = reviewed(m, snapshot);
  for (const change of [
    { category: "data-analysis" },
    { displayName: "Changed" },
    { version: "2.0.0" },
  ])
    assert.throws(
      () => prepareSubmission({ ...m, ...change }, snapshot, reviews, config),
      /metadata changed|missing maintainer review/,
    );
  const otherRepository = {
    ...m,
    source: { ...m.source, repository: "https://github.com/test/other" },
  };
  assert.throws(
    () => prepareSubmission(otherRepository, snapshot, reviews, config),
    /metadata changed/,
  );
  for (const field of [
    "sourcePath",
    "manifestSha256",
    "sourceCommit",
    "contentSha256",
  ]) {
    const changed = structuredClone(reviews);
    changed["example-skill@1.0.0"][field] = "changed";
    assert.throws(
      () => prepareSubmission(m, snapshot, changed, config),
      /metadata changed|invalid reviewed evidence|package bytes changed/,
    );
  }
  const changedEvidence = structuredClone(reviews);
  changedEvidence["example-skill@1.0.0"].licenseFiles = [];
  assert.throws(
    () => prepareSubmission(m, snapshot, changedEvidence, config),
    /license files differ/,
  );
  const changedPayload = fixture([
    ["skills/example-skill/data.txt", Buffer.from("new bytes")],
  ]);
  assert.throws(
    () => prepareSubmission(m, changedPayload, reviews, config),
    /package bytes changed/,
  );
  const changedLicense = fixture([["LICENSE", Buffer.from("changed terms")]]);
  assert.throws(
    () => prepareSubmission(m, changedLicense, reviews, config),
    /license files differ/,
  );
});

test("intake rejects malformed metadata, unsafe packages and absent license evidence", () => {
  const m = manifest();
  for (const text of [
    skillText.replace("example-skill", "another-skill"),
    skillText.replace("description: Example description\n", ""),
    skillText.replace("license: MIT\n", ""),
    "---\nname: [\n---\n",
  ])
    assert.throws(
      () =>
        inspectSubmission(
          m,
          fixture([["skills/example-skill/SKILL.md", Buffer.from(text)]]),
        ),
      /frontmatter|license/,
    );
  for (const path of [
    "nested/SKILL.md",
    ".source.json",
    "../escape",
    "skill.md",
    "CON.txt",
  ])
    assert.throws(() =>
      inspectSubmission(
        m,
        fixture([[`skills/example-skill/${path}`, Buffer.from("bad")]]),
      ),
    );
  for (const licenseFiles of [["MISSING"], ["LICENSE"]]) {
    const s = fixture([["LICENSE", Buffer.alloc(0)]]);
    assert.throws(
      () => inspectSubmission({ ...m, licenseFiles }, s),
      /license evidence/,
    );
  }
  for (const change of [
    { mode: "120000" },
    { size: LIMITS.maxFileBytes + 1 },
  ]) {
    const s = fixture();
    Object.assign(s.files[0], change);
    s.read = () => {
      assert.fail("oversized/special payload must not be read");
    };
    assert.throws(
      () => inspectSubmission(m, s),
      /resource limits|special files/,
    );
  }
});

test("CLI reads the pinned Git snapshot despite dirty checkout, catches wrong origin and writes only unsigned local output", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "skill-authoring-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repo = join(directory, "source");
  mkdirSync(join(repo, "skills", "example-skill"), { recursive: true });
  const git = (...args) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Test fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "core.autocrlf", "false");
  git("remote", "add", "origin", "git@github.com:test/skills.git");
  writeFileSync(join(repo, "skills", "example-skill", "SKILL.md"), skillText);
  writeFileSync(join(repo, "LICENSE"), "Test-only license evidence");
  git("add", ".");
  git("commit", "--quiet", "-m", "test(fixture): add source");
  const m = manifest();
  m.source.commit = git("rev-parse", "HEAD");
  writeFileSync(
    join(repo, "skills", "example-skill", "SKILL.md"),
    "dirty checkout ignored",
  );
  const manifestPath = join(directory, "release.config.json");
  writeFileSync(manifestPath, metadataJsonBytes(m));
  const cli = (...args) =>
    spawnSync(
      process.execPath,
      [
        "scripts/intake-skill.mjs",
        "--manifest",
        manifestPath,
        "--source",
        repo,
        ...args,
      ],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
    );
  writeFileSync(manifestPath, JSON.stringify(m));
  assert.notEqual(cli().status, 0, "old camelCase manifest must fail");
  writeFileSync(manifestPath, metadataJsonBytes(m));
  const inspected = cli();
  assert.equal(inspected.status, 0, inspected.stderr);
  const wireReview = JSON.parse(inspected.stdout)["example-skill@1.0.0"];
  assert.equal(wireReview.source_commit, m.source.commit);
  assert.equal("sourceCommit" in wireReview, false);
  assert.equal(
    wireReview.manifest_sha256,
    (await import("../scripts/lib/common.mjs")).sha256(metadataJsonBytes(m)),
  );
  const reviews = parseMetadataJson(inspected.stdout);
  assert.equal(reviews["example-skill@1.0.0"].sourceCommit, m.source.commit);
  const reviewPath = join(directory, "reviews.json"),
    output = join(directory, "bundle");
  writeFileSync(reviewPath, metadataJsonBytes(reviews));
  assert.notEqual(cli("--reviews", reviewPath, "--output", output).status, 0);
  Object.assign(reviews["example-skill@1.0.0"], {
    reviewedBy: "Test-only reviewer",
    reviewedOn: "2026-09-12",
  });
  writeFileSync(reviewPath, metadataJsonBytes(reviews));
  writeFileSync(reviewPath, JSON.stringify(reviews));
  assert.notEqual(
    cli("--reviews", reviewPath, "--output", output).status,
    0,
    "old camelCase review must fail",
  );
  writeFileSync(reviewPath, metadataJsonBytes(reviews));
  const built = cli("--reviews", reviewPath, "--output", output);
  assert.equal(built.status, 0, built.stderr);
  assert.equal(JSON.parse(built.stdout).signed, false);
  assert.equal(cli("--reviews", reviewPath, "--output", output).status, 0);
  const { readBundle } = await import("../scripts/lib/bundle.mjs");
  assert.equal((await readBundle(output)).root.skills.length, 1);
  git("remote", "set-url", "origin", "https://github.com/test/wrong.git");
  assert.throws(() => submissionSnapshot(repo, m), /origin does not match/);
  git("remote", "set-url", "origin", m.source.repository);
  assert.throws(
    () =>
      submissionSnapshot(repo, {
        ...m,
        source: { ...m.source, commit: git("rev-parse", "HEAD^{tree}") },
      }),
    /Git commit object/,
  );
  writeFileSync(
    manifestPath,
    metadataJsonBytes({
      ...m,
      source: { ...m.source, commit: "0".repeat(40) },
    }),
  );
  assert.notEqual(cli().status, 0);
});
