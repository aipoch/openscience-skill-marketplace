import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
const skill = (id = "example", extra = []) => ({
  id,
  files: [
    {
      path: "SKILL.md",
      bytes: Buffer.from(
        `---\nname: ${id}\ndescription: Example\nlicense: MIT\n---\nExample\n`,
      ),
      mode: "100644",
    },
    ...extra,
  ],
});
test("deterministic shards keep complete Skill roots, stable content digests and canonical ZIP bytes", async () => {
  const { buildShards } = await import("../scripts/lib/package.mjs");
  const a = skill("alpha", [
    { path: "docs/z.txt", bytes: Buffer.from("z"), mode: "100644" },
    { path: "docs/a.txt", bytes: Buffer.from("a"), mode: "100644" },
  ]);
  const b = skill("beta");
  const first = buildShards([b, a]);
  const second = buildShards([{ ...a, files: [...a.files].reverse() }, b]);
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].bytes, second[0].bytes);
  assert.equal(first[0].sha256, second[0].sha256);
  assert.deepEqual(Object.keys(unzipSync(first[0].bytes)), [
    "alpha/SKILL.md",
    "alpha/docs/a.txt",
    "alpha/docs/z.txt",
    "beta/SKILL.md",
  ]);
  assert.equal(first[0].skills[0].fileCount, 3);
});

test("package safety and shard budgets reject invalid inputs and split only between Skills", async () => {
  const { buildShards, inspectSkill } =
    await import("../scripts/lib/package.mjs");
  for (const path of [
    "../x",
    "x".repeat(256),
    "/x",
    "C:/x",
    "a\\b",
    "a//b",
    "a/./b",
    "a/../b",
    "a.",
    "CON",
    "nul.txt",
    "e\u0301.txt",
    ".SOURCE.JSON",
    ".Specialist-Package.JSON",
  ])
    assert.throws(
      () => inspectSkill(skill("example", [{ path, bytes: Buffer.from("x") }])),
      /path|reserved/,
    );
  assert.throws(
    () =>
      inspectSkill(
        skill("example", [{ path: "sKiLl.md", bytes: Buffer.from("x") }]),
      ),
    /colliding/,
  );
  assert.throws(
    () =>
      inspectSkill(
        skill("example", [
          { path: "link", bytes: Buffer.from("target"), mode: "120000" },
        ]),
      ),
    /symlink/,
  );
  assert.throws(
    () =>
      inspectSkill(
        skill("example", [
          { path: "nested/SKILL.md", bytes: Buffer.from("x") },
        ]),
      ),
    /nested/,
  );
  assert.throws(
    () =>
      inspectSkill(
        skill("example", [
          { path: "file", bytes: Buffer.from("x") },
          { path: "file/child", bytes: Buffer.from("y") },
        ]),
      ),
    /conflict/,
  );
  const a = skill("alpha"),
    b = skill("beta");
  const length = a.files[0].bytes.length;
  inspectSkill(a, {
    maxFileBytes: length,
    maxSkillBytes: length,
    maxPreviewBytes: length,
    maxFiles: 1,
  });
  for (const limit of ["maxFileBytes", "maxSkillBytes", "maxPreviewBytes"])
    assert.throws(() => inspectSkill(a, { [limit]: length - 1 }), /exceed/);
  assert.equal(buildShards([a, b], { maxSkills: 1 }).length, 2);
  assert.equal(buildShards([a, b], { maxEntries: 1 }).length, 2);
  assert.equal(buildShards([a, b], { maxExpandedBytes: length }).length, 2);
  assert.equal(buildShards([a, b], { maxPreviewBytes: length }).length, 2);
  const single = buildShards([a])[0].bytes.length;
  assert.equal(buildShards([a, b], { maxShardBytes: single }).length, 2);
  assert.throws(() => buildShards([a], { maxShardBytes: single - 1 }), /fit/);
  assert.throws(() => inspectSkill(a, { maxFiles: 16385 }), /tighten/);
});

test("content digest matches the independent Specialist protocol vector and ZIP output is timezone independent", async () => {
  const { contentDigest } = await import("../scripts/lib/package.mjs");
  const { execFileSync } = await import("node:child_process");
  const files = [
    { path: "a.txt", bytes: Buffer.from("hello") },
    { path: "目录/b.txt", bytes: Buffer.from("world") },
  ];
  assert.equal(
    contentDigest(files),
    "f712d6094d13ca88abc38bfc3ab9ecd7a7d6c59da6249b34773b3d31303adb68",
  );
  const script =
    "import {buildShards} from './scripts/lib/package.mjs';import {makeCandidate} from './test/fixtures.mjs';const s=makeCandidate();console.log(buildShards([{id:s.skill.id,files:s.files}])[0].sha256);";
  const hashes = ["UTC", "America/Los_Angeles", "Asia/Shanghai"].map((TZ) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ },
      encoding: "utf8",
    }),
  );
  assert.equal(new Set(hashes).size, 1);
});
