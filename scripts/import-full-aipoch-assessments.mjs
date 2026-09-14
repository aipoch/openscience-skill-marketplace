import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { jsonBytes, sha256 } from "./lib/common.mjs";
import { reportEvaluation } from "./lib/aipoch-audits.mjs";
import {
  readPublicationHolds,
  publicationHoldFor,
} from "./lib/publication-holds.mjs";

const { values } = parseArgs({
  options: { material: { type: "string" }, archive: { type: "string" } },
});
if (!values.material || !values.archive)
  throw new Error("--material and --archive are required");
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const manifest = await read("skills/manifest.json");
const config = await read("marketplace.config.json");
const plan = await read("skills/release_plan.json");
const queue = await read("authoring/submissions/index.json");
const digest = createHash("sha256");
for await (const chunk of createReadStream(values.archive))
  digest.update(chunk);
const archiveHash = digest.digest("hex");
if (archiveHash !== queue.selection_input.archive_sha256)
  throw new Error("Archive does not match the reviewed submission input");
const listed = execFileSync("unzip", ["-Z1", values.archive], {
  maxBuffer: 40 * 1024 * 1024,
})
  .toString()
  .split("\n");
const skillFiles = new Set(
  listed.filter((p) => p.startsWith("skills/") && p.endsWith("/SKILL.md")),
);
const items = manifest.entries.map((e) => {
  const selected = plan.selected.find(
    (s) => s.id === e.id && s.version === e.version,
  );
  const deferred = plan.deferred.find(
    (s) => s.id === e.id && s.version === e.version,
  );
  return {
    record_key: `aipoch/${e.id}@${e.version}`,
    skill_id: e.id,
    provider_id: "aipoch",
    version: e.version,
    category: e.category,
    source: {
      ...config.source,
      commit: selected?.source_commit ?? config.source.commit,
      path: e.source_path,
    },
    authority: "skills/manifest.json",
    review_state: selected ? "selected" : "deferred",
    review_notes: deferred ? [deferred.reason] : [],
  };
});
for (const submission of queue.submissions) {
  const e = await read(submission.release_config);
  items.push({
    record_key: submission.submission_key,
    skill_id: e.id,
    provider_id: submission.provider_id,
    version: e.version,
    category: e.category,
    source: e.source,
    authority: submission.release_config,
    review_state: submission.state,
    review_notes: [
      ...submission.blockers,
      ...submission.publication_constraints,
      ...submission.review_flags,
    ],
  });
}
const entries = [];
const holds = await readPublicationHolds();
const reports = new Map();
for (const item of items) {
  const prefix = `skills/${item.source.repository.replace("https://github.com/", "").replace("/", "__")}/${item.source.path}`;
  if (!skillFiles.delete(`${prefix}/SKILL.md`))
    throw new Error(`Missing or duplicate material: ${prefix}`);
  const candidates = [];
  for (const name of await readdir(path.join(values.material, prefix))) {
    if (!name.endsWith(".json") || name.startsWith("._")) continue;
    const bytes = await readFile(path.join(values.material, prefix, name));
    let report;
    try {
      report = JSON.parse(bytes);
    } catch {
      continue;
    }
    if (typeof report.final?.score === "number")
      candidates.push({ name, bytes, report });
  }
  if (candidates.length !== 1)
    throw new Error(
      `Expected exactly one audit in ${prefix}: ${candidates.length}`,
    );
  const { name, bytes, report } = candidates[0];
  const evaluation = reportEvaluation(report);
  const reportHash = sha256(bytes);
  reports.set(reportHash, bytes);
  const skillBytes = execFileSync(
    "unzip",
    ["-p", values.archive, `${prefix}/SKILL.md`],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  entries.push({
    ...item,
    publication_status: publicationHoldFor(item.source, holds)
      ? "temporarily-withheld"
      : "requires-review",
    material_skill_path: `${prefix}/SKILL.md`,
    material_skill_sha256: sha256(skillBytes),
    report_path: `audits/reports/${reportHash}.json`,
    report_sha256: reportHash,
    report_archive_path: `${prefix}/${name}`,
    report_skill_name: report.meta.skill_name,
    identity_review_required: report.meta.skill_name !== item.skill_id,
    evaluation,
  });
}
if (
  skillFiles.size ||
  entries.length !== 776 ||
  new Set(entries.map((e) => e.record_key)).size !== 776
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
  jsonBytes({
    schema_version: 1,
    selection_input: queue.selection_input,
    scope: "submitted-material",
    auditor: "AIPOCH",
    record_count: entries.length,
    providers: [
      {
        id: "aipoch",
        name: "AIPOCH",
        repository: config.source.repository,
        record_count: 584,
      },
      ...queue.providers.map(({ id, name, repository, record_count }) => ({
        id,
        name,
        repository,
        record_count,
      })),
    ],
    entries,
  }),
);
console.log(
  JSON.stringify({
    records: entries.length,
    reports: reports.size,
    identity_reviews: entries.filter((e) => e.identity_review_required).length,
  }),
);
