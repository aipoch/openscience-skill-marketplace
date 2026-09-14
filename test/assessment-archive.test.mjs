import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { zipSync } from "fflate";
import { readAssessmentArchive } from "../scripts/lib/assessment-archive.mjs";
import { sha256 } from "../scripts/lib/common.mjs";
const prefix = "skills/example__source/skills/example";
const report = Buffer.from(
  JSON.stringify({
    meta: {
      skill_name: "example",
      evaluator_version: "skill-auditor@1.0",
      evaluated_on: "2026-09-14",
    },
    final: { score: 81, max: 100 },
  }),
);
const skill = Buffer.from("---\nname: example\ndescription: fixture\n---\n");
const inputs = {
  [prefix + "/SKILL.md"]: skill,
  [prefix + "/report.json"]: report,
};

test("archive reader binds original Skill/report bytes and rejects substituted, missing and ambiguous material", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "audit-zip-"));
  try {
    const filename = path.join(dir, "source.zip");
    const bytes = Buffer.from(zipSync(inputs));
    await writeFile(filename, bytes);
    const archive = await readAssessmentArchive(filename, sha256(bytes));
    assert.deepEqual(archive.readSkill(prefix), skill);
    assert.deepEqual(archive.reportFor(prefix).bytes, report);
    await assert.rejects(
      readAssessmentArchive(filename, "0".repeat(64)),
      /does not match/,
    );
    await writeFile(filename, "not a zip");
    await assert.rejects(readAssessmentArchive(filename));
    await writeFile(filename, zipSync({ [prefix + "/SKILL.md"]: skill }));
    assert.throws(
      () => archive.reportFor(prefix + "-other"),
      /Expected one archived report/,
    );
    const missing = await readAssessmentArchive(filename);
    assert.throws(() => missing.reportFor(prefix), /got 0/);
    await writeFile(
      filename,
      zipSync({ ...inputs, [prefix + "/second.json"]: report }),
    );
    const ambiguous = await readAssessmentArchive(filename);
    assert.throws(() => ambiguous.reportFor(prefix), /got 2/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("display importer uses archive reports, rejects arbitrary files and cannot consume separate edited material", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "audit-import-"));
  try {
    const archive = path.join(dir, "input.zip"),
      catalog = path.join(dir, "catalog.json"),
      output = path.join(dir, "out");
    await writeFile(archive, zipSync(inputs));
    await writeFile(
      catalog,
      JSON.stringify({
        skills: [
          {
            id: "example",
            version: "1.0.0",
            source: {
              repository: "https://github.com/example/source",
              commit: "a".repeat(40),
              path: "skills/example",
            },
            content_sha256: "b".repeat(64),
          },
        ],
      }),
    );
    const cli = path.resolve("scripts/import-aipoch-audits.mjs");
    const args = [
      cli,
      "--catalog",
      catalog,
      "--archive",
      archive,
      "--output",
      output,
    ];
    execFileSync(process.execPath, args, { stdio: "pipe" });
    const result = JSON.parse(
      await readFile(path.join(output, "registry.json")),
    );
    assert.equal(result.source_archive_sha256, sha256(await readFile(archive)));
    assert.equal(result.entries[0].report_sha256, sha256(report));
    assert.deepEqual(
      await readFile(path.join(output, "reports", sha256(report) + ".json")),
      report,
    );
    assert.throws(() =>
      execFileSync(process.execPath, [...args, "--material", dir], {
        stdio: "pipe",
      }),
    );
    await writeFile(archive, "arbitrary source");
    assert.throws(() =>
      execFileSync(process.execPath, args, { stdio: "pipe" }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
