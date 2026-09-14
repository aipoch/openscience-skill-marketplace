import { readFile, stat } from "node:fs/promises";
import { unzipSync } from "fflate";
import { sha256, assertPath } from "./common.mjs";
import { reportEvaluation } from "./aipoch-audits.mjs";

// Read only assessment inputs from the archive. Never extract or execute payloads.
export async function readAssessmentArchive(filename, expectedSha256) {
  const info = await stat(filename);
  if (!info.isFile() || info.size > 512 * 1024 * 1024)
    throw new Error("Invalid assessment archive size");
  const bytes = await readFile(filename);
  const archiveSha256 = sha256(bytes);
  if (expectedSha256 && archiveSha256 !== expectedSha256)
    throw new Error("Archive does not match the reviewed submission input");
  const seen = new Set();
  let total = 0;
  const files = unzipSync(bytes, {
    filter(file) {
      if (
        !file.name.startsWith("skills/") ||
        !(file.name.endsWith("/SKILL.md") || file.name.endsWith(".json"))
      )
        return false;
      assertPath(file.name);
      if (seen.has(file.name))
        throw new Error("Duplicate assessment archive path");
      seen.add(file.name);
      total += file.originalSize;
      if (
        seen.size > 10000 ||
        file.originalSize > 4 * 1024 * 1024 ||
        total > 128 * 1024 * 1024
      )
        throw new Error("Assessment archive exceeds resource limits");
      return true;
    },
  });
  const skillPaths = new Set(
    Object.keys(files).filter((name) => name.endsWith("/SKILL.md")),
  );
  if (!skillPaths.size) throw new Error("Archive contains no Skill material");
  return {
    archiveSha256,
    skillPaths,
    readSkill(prefix) {
      const content = files[`${prefix}/SKILL.md`];
      if (!content) throw new Error(`Missing archived Skill: ${prefix}`);
      return Buffer.from(content);
    },
    reportFor(prefix) {
      const candidates = [];
      for (const [name, content] of Object.entries(files)) {
        const relative = name.slice(prefix.length + 1);
        if (
          !name.startsWith(prefix + "/") ||
          relative.includes("/") ||
          relative.startsWith("._") ||
          !relative.endsWith(".json")
        )
          continue;
        let report;
        try {
          report = JSON.parse(Buffer.from(content));
        } catch {
          continue;
        }
        if (typeof report.final?.score !== "number") continue;
        reportEvaluation(report);
        candidates.push({
          name: relative,
          bytes: Buffer.from(content),
          report,
        });
      }
      if (candidates.length !== 1)
        throw new Error(
          `Expected one archived report for ${prefix}, got ${candidates.length}`,
        );
      return candidates[0];
    },
  };
}
