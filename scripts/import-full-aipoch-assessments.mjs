import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { sha256 } from "./lib/common.mjs";
import { parseMetadataJson, metadataJsonBytes } from "./lib/metadata-json.mjs";
import { readAssessmentArchive } from "./lib/assessment-archive.mjs";
import { archiveSkillPrefix, reportEvaluation } from "./lib/aipoch-audits.mjs";
import {
  readPublicationHolds,
  publicationHoldFor,
} from "./lib/publication-holds.mjs";

const { values } = parseArgs({
  options: { archive: { type: "string" } },
});
if (!values.archive) throw new Error("--archive is required");
const read = async (p) => parseMetadataJson(await readFile(p));
const manifest = await read("skills/manifest.json");
const config = await read("marketplace.config.json");
const plan = await read("skills/release_plan.json");
const queue = await read("authoring/submissions/index.json");
const archive = await readAssessmentArchive(
  values.archive,
  queue.selectionInput.archiveSha256,
);
const skillFiles = new Set(archive.skillPaths);
const items = manifest.entries.map((e) => {
  const selected = plan.selected.find(
    (s) => s.id === e.id && s.version === e.version,
  );
  const deferred = plan.deferred.find(
    (s) => s.id === e.id && s.version === e.version,
  );
  return {
    recordKey: `aipoch/${e.id}@${e.version}`,
    skillId: e.id,
    providerId: "aipoch",
    version: e.version,
    category: e.category,
    source: {
      ...config.source,
      commit: selected?.sourceCommit ?? config.source.commit,
      path: e.sourcePath,
    },
    authority: "skills/manifest.json",
    reviewState: selected ? "selected" : "deferred",
    reviewNotes: deferred ? [deferred.reason] : [],
  };
});
for (const submission of queue.submissions) {
  const e = await read(submission.releaseConfig);
  items.push({
    recordKey: submission.submissionKey,
    skillId: e.id,
    providerId: submission.providerId,
    version: e.version,
    category: e.category,
    source: e.source,
    authority: submission.releaseConfig,
    reviewState: submission.state,
    reviewNotes: [
      ...submission.blockers,
      ...submission.publicationConstraints,
      ...submission.reviewFlags,
    ],
  });
}
const entries = [];
const holds = await readPublicationHolds();
const reports = new Map();
for (const item of items) {
  const prefix = archiveSkillPrefix(item.source);
  if (!skillFiles.delete(`${prefix}/SKILL.md`))
    throw new Error(`Missing or duplicate material: ${prefix}`);
  const { name, bytes, report } = archive.reportFor(prefix);
  const evaluation = reportEvaluation(report);
  const reportHash = sha256(bytes);
  reports.set(reportHash, bytes);
  const skillBytes = archive.readSkill(prefix);
  entries.push({
    ...item,
    publicationStatus: publicationHoldFor(item.source, holds)
      ? "temporarily-withheld"
      : "requires-review",
    materialSkillPath: `${prefix}/SKILL.md`,
    materialSkillSha256: sha256(skillBytes),
    reportPath: `audits/reports/${reportHash}.json`,
    reportSha256: reportHash,
    reportArchivePath: `${prefix}/${name}`,
    reportSkillName: report.meta.skill_name,
    identityReviewRequired: report.meta.skill_name !== item.skillId,
    evaluation,
  });
}
if (
  skillFiles.size ||
  entries.length !== 776 ||
  new Set(entries.map((e) => e.recordKey)).size !== 776
)
  throw new Error("Full 776-member material coverage failed");
await mkdir("audits/reports", { recursive: true });
for (const [hash, bytes] of reports) {
  const destination = `audits/reports/${hash}.json`;
  try {
    if (!bytes.equals(await readFile(destination)))
      throw new Error(`Evidence conflict: ${destination}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(destination, bytes, { flag: "wx" });
  }
}
await writeFile(
  "audits/full-inclusion.json",
  metadataJsonBytes({
    schemaVersion: 1,
    selectionInput: queue.selectionInput,
    scope: "submitted-material",
    auditor: "AIPOCH",
    recordCount: entries.length,
    providers: [
      {
        id: "aipoch",
        name: "AIPOCH",
        repository: config.source.repository,
        recordCount: 584,
      },
      ...queue.providers.map(({ id, name, repository, recordCount }) => ({
        id,
        name,
        repository,
        recordCount,
      })),
    ],
    entries,
  }),
);
console.log(
  JSON.stringify({
    records: entries.length,
    reports: reports.size,
    identityReviews: entries.filter((e) => e.identityReviewRequired).length,
  }),
);
