import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { sha256, assertPath, utf8Compare } from "./common.mjs";
import { inspectFrontmatter } from "./catalog.mjs";

export const LIMITS = Object.freeze({
  maxFileBytes: 50 * 1024 * 1024,
  maxSkillBytes: 128 * 1024 * 1024,
  maxFiles: 16384,
  maxDepth: 8,
  maxPreviewBytes: 4 * 1024 * 1024,
  maxShardBytes: 64 * 1024 * 1024,
  maxExpandedBytes: 256 * 1024 * 1024,
  maxEntries: 32768,
  maxSkills: 128,
});
function effectiveLimits(overrides) {
  for (const [key, value] of Object.entries(overrides))
    if (
      !(key in LIMITS) ||
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      value > LIMITS[key]
    )
      throw new Error("limits can only tighten the client contract");
  return { ...LIMITS, ...overrides };
}
export function contentDigest(files) {
  const hash = createHash("sha256").update(
    "OpenScience Skill content digest v1\0",
  );
  const length = (n) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(BigInt(n));
    return b;
  };
  for (const file of [...files].sort((a, b) => utf8Compare(a.path, b.path))) {
    const p = Buffer.from(file.path);
    hash
      .update(length(p.length))
      .update(p)
      .update(length(file.bytes.length))
      .update(file.bytes);
  }
  return hash.digest("hex");
}
export function inspectSkill(skill, overrides = {}) {
  const limits = effectiveLimits(overrides);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.id) || skill.id.length > 128)
    throw new Error("invalid Skill ID");
  if (!skill.files.length || skill.files.length > limits.maxFiles)
    throw new Error("Skill file count exceeds limit");
  const seen = new Set();
  let totalBytes = 0;
  let previewBytes = 0;
  for (const file of skill.files) {
    assertPath(file.path);
    const folded = file.path.toLowerCase();
    if (seen.has(folded))
      throw new Error(`duplicate or case-colliding path: ${file.path}`);
    seen.add(folded);
    if (file.mode !== undefined && !["100644", "100755"].includes(file.mode))
      throw new Error("symlink or special file is not allowed");
    if ([".source.json", ".specialist-package.json"].includes(folded))
      throw new Error("reserved App root file");
    if (file.path.split("/").length > limits.maxDepth)
      throw new Error("shard path depth exceeds limit");
    if (!Buffer.isBuffer(file.bytes) || file.bytes.length > limits.maxFileBytes)
      throw new Error("file bytes exceed limit");
    totalBytes += file.bytes.length;
    if (file.path === "SKILL.md") {
      const front = inspectFrontmatter(file.bytes.toString());
      if (!front.valid || front.name !== skill.id)
        throw new Error("invalid Skill frontmatter or identity");
      previewBytes = file.bytes.length;
    } else if (folded.endsWith("/skill.md"))
      throw new Error("nested Skill root changes bundle discovery");
  }
  for (const file of seen) {
    const parts = file.split("/");
    for (let n = 1; n < parts.length; n++)
      if (seen.has(parts.slice(0, n).join("/")))
        throw new Error("file/directory path conflict");
  }
  if (!seen.has("skill.md") || !skill.files.some((f) => f.path === "SKILL.md"))
    throw new Error("missing exact SKILL.md");
  if (totalBytes > limits.maxSkillBytes)
    throw new Error("Skill bytes exceed limit");
  if (previewBytes > limits.maxPreviewBytes)
    throw new Error("Skill preview bytes exceed limit");
  return {
    id: skill.id,
    contentSha256: contentDigest(skill.files),
    fileCount: skill.files.length,
    totalBytes,
    previewBytes,
  };
}
function pack(skills) {
  const entries = Object.create(null);
  for (const skill of skills)
    for (const file of [...skill.files].sort((a, b) =>
      utf8Compare(a.path, b.path),
    ))
      entries[`${skill.id}/${file.path}`] = [
        file.bytes,
        { mtime: new Date(1980, 0, 1), level: 9 },
      ];
  return Buffer.from(zipSync(entries));
}
export function buildShards(input, overrides = {}) {
  const limits = effectiveLimits(overrides);
  const seen = new Set();
  const skills = [...input]
    .sort((a, b) => utf8Compare(a.id, b.id))
    .map((skill) => {
      if (seen.has(skill.id)) throw new Error("duplicate Skill ID");
      seen.add(skill.id);
      return { ...skill, metrics: inspectSkill(skill, limits) };
    });
  const result = [];
  let current = [];
  const fits = (candidate) =>
    candidate.length <= limits.maxSkills &&
    candidate.reduce((n, s) => n + s.metrics.fileCount, 0) <=
      limits.maxEntries &&
    candidate.reduce((n, s) => n + s.metrics.totalBytes, 0) <=
      limits.maxExpandedBytes &&
    candidate.reduce((n, s) => n + s.metrics.previewBytes, 0) <=
      limits.maxPreviewBytes;
  const finish = (group) => {
    if (!group.length) return;
    const bytes = pack(group);
    if (bytes.length > limits.maxShardBytes) {
      if (group.length === 1)
        throw new Error(`Skill cannot fit one bounded shard: ${group[0].id}`);
      const middle = Math.ceil(group.length / 2);
      finish(group.slice(0, middle));
      finish(group.slice(middle));
      return;
    }
    const digest = sha256(bytes);
    result.push({
      path: `shards/${digest}.zip`,
      sha256: digest,
      bytes,
      skills: group.map((s) => s.metrics),
    });
  };
  for (const skill of skills) {
    if (!fits([skill]))
      throw new Error(`Skill cannot fit one bounded shard: ${skill.id}`);
    if (!fits([...current, skill])) {
      finish(current);
      current = [];
    }
    current.push(skill);
  }
  finish(current);
  return result;
}
