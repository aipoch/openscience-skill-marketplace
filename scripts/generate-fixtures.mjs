import { parseArgs } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { gitSnapshot } from "./lib/source.mjs";
import { buildCatalog } from "./lib/build.mjs";
import { writeBundle } from "./lib/bundle.mjs";
import { evaluationToWire } from "./lib/protocol.mjs";
import { sha256, jsonBytes } from "./lib/common.mjs";
import { sourceUrl } from "./lib/catalog.mjs";
const { values } = parseArgs({ options: { source: { type: "string" } } });
if (!values.source) throw new Error("--source is required");
const config = JSON.parse(await readFile("marketplace.config.json"));
const audit = JSON.parse(await readFile("skills/source-audit.json"));
const snapshot = gitSnapshot(values.source, config.source.commit);
const licenseBytes = snapshot.read(["LICENSE"]).get("LICENSE");
await mkdir("protocol/fixtures/source", { recursive: true });
await writeFile("protocol/fixtures/source/LICENSE", licenseBytes);
const candidates = [];
for (const id of ["primary-plan-recommender", "pdf-to-ppt-pack"]) {
  const entry = audit.entries.find((e) => e.id === id);
  const selected = snapshot.files.filter((f) =>
    f.path.startsWith(entry.source.path + "/"),
  );
  const data = snapshot.read(selected.map((f) => f.path));
  const files = [];
  for (const f of selected) {
    const relative = f.path.slice(entry.source.path.length + 1);
    const destination = path.join("protocol/fixtures/source", id, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, data.get(f.path));
    files.push({ path: relative, bytes: data.get(f.path), mode: f.mode });
  }
  const evaluation = evaluationToWire(entry.evaluation);
  candidates.push({
    skill: {
      id,
      version: entry.version,
      display_name: id,
      summary: entry.description,
      category: entry.category,
      inclusion_tier: entry.inclusionTier,
      source: entry.source,
      publisher: config.publisher,
      ...(entry.authors ? { authors: entry.authors } : {}),
      license: {
        expression: entry.declaredLicense,
        evidence: [
          {
            url: sourceUrl(entry.source, entry.source.path + "/SKILL.md"),
            sha256: sha256(data.get(entry.source.path + "/SKILL.md")),
          },
        ],
        review: {
          reviewed_by: "TEST FIXTURE ONLY — redistribution review pending",
          reviewed_on: "2026-09-12",
        },
      },
      ...(evaluation ? { evaluation } : {}),
    },
    files,
  });
}
const built = buildCatalog(candidates, { marketplace: config.marketplace });
await writeBundle("protocol/fixtures/snapshot", built);
await writeFile(
  "protocol/fixtures/provenance.json",
  jsonBytes({
    source: config.source,
    fixtureOnly: true,
    members: candidates.map((c) => c.skill.id),
  }),
);
console.log(`Generated two real-source fixtures: ${built.root.revision}`);
