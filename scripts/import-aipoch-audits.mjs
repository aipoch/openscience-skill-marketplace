import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import { jsonBytes, sha256 } from "./lib/common.mjs";
import { reportEvaluation } from "./lib/aipoch-audits.mjs";

const { values } = parseArgs({
  options: {
    catalog: { type: "string" },
    material: { type: "string" },
    archive: { type: "string" },
    output: { type: "string", default: "audits" },
  },
});
for (const key of ["catalog", "material", "archive"])
  if (!values[key]) throw new Error(`Missing --${key}`);
const root = JSON.parse(await readFile(values.catalog, "utf8"));
const digest = createHash("sha256");
for await (const chunk of createReadStream(values.archive))
  digest.update(chunk);
const excluded = ["get-available-resources", "scientific-brainstorming"];
const entries = [];
const reports = new Map();
for (const skill of root.skills) {
  if (excluded.includes(skill.id)) continue;
  const relative = `skills/${skill.source.repository.replace("https://github.com/", "").replace("/", "__")}/${skill.source.path}`;
  const directory = path.join(values.material, relative);
  const candidates = [];
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".json") || name.startsWith("._")) continue;
    const bytes = await readFile(path.join(directory, name));
    let report;
    try {
      report = JSON.parse(bytes);
    } catch {
      continue;
    }
    if (typeof report.final?.score !== "number") continue;
    reportEvaluation(report);
    if (report.meta.skill_name !== skill.id)
      throw new Error(`Skill name mismatch: ${relative}/${name}`);
    candidates.push({ name, bytes });
  }
  if (candidates.length !== 1)
    throw new Error(
      `Expected one report for ${relative}, got ${candidates.length}`,
    );
  const { name, bytes } = candidates[0];
  const report_sha256 = sha256(bytes);
  reports.set(report_sha256, bytes);
  entries.push({
    id: skill.id,
    version: skill.version,
    source: skill.source,
    content_sha256: skill.content_sha256,
    report_sha256,
    report_archive_path: `${relative}/${name}`,
  });
}
await mkdir(path.join(values.output, "reports"), { recursive: true });
for (const [hash, bytes] of reports)
  await writeFile(path.join(values.output, "reports", `${hash}.json`), bytes, {
    flag: "wx",
  });
await writeFile(
  path.join(values.output, "registry.json"),
  jsonBytes({
    schema_version: 1,
    source_archive_name: path.basename(values.archive),
    source_archive_sha256: digest.digest("hex"),
    excluded_ids: excluded,
    entries,
  }),
  { flag: "wx" },
);
console.log(
  `Imported ${entries.length} exact repository/path/id matches; ${excluded.length} explicitly excluded.`,
);
