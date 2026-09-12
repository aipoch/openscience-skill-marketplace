import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { makeCandidate } from "./fixtures.mjs";
import { prepareCandidates } from "../scripts/lib/prepare.mjs";
import { buildCatalog } from "../scripts/lib/build.mjs";
import {
  contentDigest,
  inspectSkill,
  LIMITS,
} from "../scripts/lib/package.mjs";
import { sha256 } from "../scripts/lib/common.mjs";

const licenseBytes = Buffer.from(
  "Test-only copyright © fixture\r\nLicense notice\r\n",
);
const licensePath = `LICENSES/${sha256(licenseBytes)}.txt`;

function reviewInput(sourceFiles = [], evidencePaths = ["LICENSE"]) {
  const candidate = makeCandidate("alpha");
  candidate.files.push(...sourceFiles);
  const source = candidate.skill.source;
  const contents = new Map([
    ["LICENSE", licenseBytes],
    ["COPYING", licenseBytes],
    ...candidate.files.map((file) => [
      `${source.path}/${file.path}`,
      file.bytes,
    ]),
  ]);
  const snapshot = {
    files: [...contents].map(([path, bytes]) => ({
      path,
      size: bytes.length,
      mode: "100644",
    })),
    read: (paths) => new Map(paths.map((path) => [path, contents.get(path)])),
  };
  const review = {
    sourceCommit: source.commit,
    contentSha256: contentDigest(candidate.files),
    reviewedBy: "Test-only reviewer",
    reviewedOn: "2026-09-12",
    licenseExpression: "MIT",
    licenseFiles: evidencePaths.map((path) => ({
      path,
      sha256: sha256(contents.get(path)),
    })),
  };
  const prepare = () =>
    prepareCandidates(
      {
        entries: [
          {
            id: "alpha",
            version: "1.0.0",
            source,
            description: "Test-only fixture",
            category: "Other",
            declaredLicense: "MIT",
            issues: [],
          },
        ],
      },
      { "alpha@1.0.0": review },
      { publisher: candidate.skill.publisher },
      snapshot,
    )[0];
  return { candidate, contents, review, prepare };
}

test("external license bytes survive preparation and ZIP distribution with complete package metrics", () => {
  const input = reviewInput([
    { path: "raw_report.json", bytes: Buffer.from('{"maxScore":100}\r\n') },
  ]);
  const prepared = input.prepare();
  assert.deepEqual(
    prepared.files.slice(0, input.candidate.files.length),
    input.candidate.files.map((file) => ({ ...file, mode: "100644" })),
  );
  assert.deepEqual(prepared.files.at(-1), {
    path: licensePath,
    mode: "100644",
    bytes: licenseBytes,
  });
  assert.equal(
    input.review.contentSha256,
    contentDigest(input.candidate.files),
  );
  assert.notEqual(contentDigest(prepared.files), input.review.contentSha256);
  const built = buildCatalog([prepared]);
  const descriptor = JSON.parse(built.objects.get("releases/alpha/1.0.0.json"));
  const archive = built.objects.get(descriptor.artifact.path);
  const extracted = unzipSync(archive);
  assert.deepEqual(
    Object.keys(extracted).sort(),
    prepared.files.map((file) => `alpha/${file.path}`).sort(),
  );
  for (const file of prepared.files)
    assert.deepEqual(Buffer.from(extracted[`alpha/${file.path}`]), file.bytes);
  assert.equal(
    descriptor.package.content_sha256,
    contentDigest(prepared.files),
  );
  assert.equal(descriptor.package.file_count, prepared.files.length);
  assert.equal(
    descriptor.package.uncompressed_bytes,
    prepared.files.reduce((n, file) => n + file.bytes.length, 0),
  );
  assert.equal(descriptor.artifact.sha256, sha256(archive));
  assert.equal(
    descriptor.skill.license.evidence[0].sha256,
    sha256(Buffer.from(extracted[`alpha/${licensePath}`])),
  );
  assert.ok(descriptor.skill.license.evidence[0].url.endsWith("/LICENSE"));
  assert.deepEqual(buildCatalog([input.prepare()]).rootBytes, built.rootBytes);
});

test("local evidence stays in place and identical external evidence is bundled only once after verification", () => {
  const local = reviewInput(
    [{ path: "LICENSE", bytes: licenseBytes }],
    ["skills/alpha/LICENSE"],
  );
  assert.deepEqual(
    local.prepare().files.map((file) => file.path),
    ["SKILL.md", "LICENSE"],
  );
  const duplicate = reviewInput([], ["LICENSE", "COPYING"]);
  const prepared = duplicate.prepare();
  assert.equal(prepared.files.length, 2);
  assert.equal(prepared.skill.license.evidence.length, 2);
  duplicate.contents.set("COPYING", Buffer.from("tampered duplicate evidence"));
  assert.throws(duplicate.prepare, /license evidence changed/);
});

test("generated license paths cannot overwrite or conflict with reviewed source files", () => {
  for (const path of [
    licensePath,
    licensePath.toLowerCase(),
    "LICENSES",
    `${licensePath}/child.txt`,
  ]) {
    const input = reviewInput([{ path, bytes: licenseBytes }]);
    assert.throws(
      input.prepare,
      /duplicate or case-colliding|file\/directory path conflict/,
    );
    assert.equal(
      input.review.contentSha256,
      contentDigest(input.candidate.files),
    );
  }
});

test("license files count toward package limits and never waive missing review", () => {
  const extra = Array.from({ length: LIMITS.maxFiles - 1 }, (_, index) => ({
    path: `references/${index}.txt`,
    bytes: Buffer.alloc(0),
  }));
  const input = reviewInput(extra);
  assert.equal(
    inspectSkill({ id: "alpha", files: input.candidate.files }).fileCount,
    LIMITS.maxFiles,
  );
  assert.throws(input.prepare, /file count exceeds limit/);
  input.review.reviewedBy = "";
  assert.throws(
    input.prepare,
    (error) => error.blockers?.[0]?.code === "missing-review",
  );
});
