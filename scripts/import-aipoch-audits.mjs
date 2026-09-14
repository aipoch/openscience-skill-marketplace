import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { sha256 } from "./lib/common.mjs";
import { metadataJsonBytes, parseMetadataJson } from "./lib/metadata-json.mjs";
import {
  archiveSkillPrefix,
  parseAuditRegistry,
} from "./lib/aipoch-audits.mjs";
import { readAssessmentArchive } from "./lib/assessment-archive.mjs";

const { values } = parseArgs({
  options: {
    catalog: { type: "string" },
    archive: { type: "string" },
    output: { type: "string", default: "audits" },
  },
});
for (const key of ["catalog", "archive"])
  if (!values[key]) throw new Error(`Missing --${key}`);
const root = parseMetadataJson(await readFile(values.catalog));
const archive = await readAssessmentArchive(values.archive);
const excludedIds = ["get-available-resources", "scientific-brainstorming"];
const entries = [],
  reports = new Map();
for (const skill of root.skills) {
  if (excludedIds.includes(skill.id)) continue;
  const prefix = archiveSkillPrefix(skill.source);
  archive.readSkill(prefix);
  const { name, bytes, report } = archive.reportFor(prefix);
  if (report.meta.skill_name !== skill.id)
    throw new Error(`Skill name mismatch: ${prefix}/${name}`);
  const reportSha256 = sha256(bytes);
  reports.set(reportSha256, bytes);
  entries.push({
    id: skill.id,
    version: skill.version,
    source: skill.source,
    contentSha256: skill.contentSha256,
    reportSha256,
    reportArchivePath: `${prefix}/${name}`,
  });
}
const registryBytes = metadataJsonBytes({
  schemaVersion: 1,
  sourceArchiveName: path.basename(values.archive),
  sourceArchiveSha256: archive.archiveSha256,
  excludedIds,
  entries,
});
parseAuditRegistry(registryBytes);
await mkdir(path.join(values.output, "reports"), { recursive: true });
for (const [hash, bytes] of reports)
  await writeFile(path.join(values.output, "reports", `${hash}.json`), bytes, {
    flag: "wx",
  });
await writeFile(path.join(values.output, "registry.json"), registryBytes, {
  flag: "wx",
});
console.log(
  `Imported ${entries.length} archive-bound reports; ${excludedIds.length} explicitly excluded.`,
);
