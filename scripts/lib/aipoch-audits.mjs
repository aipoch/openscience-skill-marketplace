import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsonBytes, sha256, assertSource } from "./common.mjs";
import { signRoot } from "./signing.mjs";

const hash = /^[a-f0-9]{64}$/;
export const auditIdentity = (entry) =>
  JSON.stringify([
    entry.id,
    entry.version,
    entry.source.repository,
    entry.source.commit,
    entry.source.path,
    entry.content_sha256,
  ]);

export function reportEvaluation(report) {
  const pair = (score, max_score) => {
    if (
      !Number.isFinite(score) ||
      !Number.isFinite(max_score) ||
      score < 0 ||
      max_score <= 0 ||
      score > max_score
    )
      throw new Error("Invalid audit score");
    return { score, max_score };
  };
  const meta = report.meta;
  if (
    !meta ||
    typeof meta.skill_name !== "string" ||
    typeof meta.evaluator_version !== "string" ||
    !meta.evaluator_version.startsWith("skill-auditor@")
  )
    throw new Error("Missing skill-auditor identity");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(meta.evaluated_on) ||
    !Number.isFinite(Date.parse(meta.evaluated_on)) ||
    new Date(meta.evaluated_on).toISOString().slice(0, 10) !== meta.evaluated_on
  )
    throw new Error("Invalid audit date");
  return {
    kind: "aipoch-audit",
    auditor: "AIPOCH",
    scope: "submitted-material",
    ...pair(report.final?.score, report.final?.max),
    evaluated_on: meta.evaluated_on,
    evaluator_version: meta.evaluator_version,
    ...(report.static_score
      ? {
          static_score: pair(
            report.static_score.subtotal,
            report.static_score.max,
          ),
        }
      : {}),
    ...(report.dynamic_score
      ? {
          dynamic_score: pair(
            report.dynamic_score.execution_avg,
            report.dynamic_score.max,
          ),
        }
      : {}),
  };
}

// Audit evidence is independent of the immutable v1 install descriptor. Never re-sign a
// historical Skill release merely to add editorial attribution or a new assessment.
export async function buildAuditCatalog(root, directory = "audits") {
  const input = JSON.parse(
    await readFile(path.join(directory, "registry.json"), "utf8"),
  );
  if (input.schema_version !== 1 || !hash.test(input.source_archive_sha256))
    throw new Error("Invalid audit registry");
  const selected = new Map(
    root.skills.map((entry) => [auditIdentity(entry), entry]),
  );
  const seen = new Set();
  const entries = [];
  const reports = new Map();
  for (const record of input.entries) {
    assertSource(record.source);
    if (!hash.test(record.report_sha256) || !hash.test(record.content_sha256))
      throw new Error("Invalid audit digest");
    const key = auditIdentity(record);
    if (seen.has(key)) throw new Error("Duplicate audit identity");
    seen.add(key);
    const bytes = await readFile(
      path.join(directory, "reports", `${record.report_sha256}.json`),
    );
    if (bytes.length > 1024 * 1024 || sha256(bytes) !== record.report_sha256)
      throw new Error("Audit report digest mismatch");
    const report = JSON.parse(bytes);
    if (report.meta?.skill_name !== record.id)
      throw new Error("Audit report Skill identity mismatch");
    const evaluation = reportEvaluation(report);
    const expectedPrefix = `skills/${record.source.repository.replace("https://github.com/", "").replace("/", "__")}/${record.source.path}/`;
    if (
      !record.report_archive_path.startsWith(expectedPrefix) ||
      record.report_archive_path.slice(expectedPrefix.length).includes("/") ||
      !record.report_archive_path.endsWith(".json")
    )
      throw new Error("Audit material path mismatch");
    if (!selected.has(key)) continue;
    entries.push({ ...record, evaluation });
    reports.set(`audits/reports/${record.report_sha256}.json`, bytes);
  }
  return {
    catalog: {
      schema_version: 1,
      protocol: "openscience-aipoch-audits",
      catalog_revision: root.revision,
      source_archive_sha256: input.source_archive_sha256,
      entries,
    },
    reports,
  };
}

export async function publishAuditCatalog({ root, store, signing, directory }) {
  const { catalog, reports } = await buildAuditCatalog(root, directory);
  const signature = signRoot(jsonBytes(catalog), signing);
  for (const [relative, bytes] of reports)
    await store.putImmutable(relative, bytes);
  // One atomic envelope avoids mismatched mutable payload/signature pairs.
  await store.writeAuditCatalog(jsonBytes({ catalog, signature }));
  return { audit_count: catalog.entries.length };
}
