import { parseMetadataJson, metadataJsonBytes } from "./lib/metadata-json.mjs";
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { auditSources, gitSnapshot } from "./lib/source.mjs";
import { validateManifest } from "./lib/catalog.mjs";
const { values } = parseArgs({
  options: {
    source: { type: "string" },
    output: { type: "string", default: "skills/source-audit.json" },
    check: { type: "boolean" },
  },
});
if (!values.source)
  throw new Error("--source <local upstream Git repository> is required");
const config = parseMetadataJson(await readFile("marketplace.config.json"));
const manifest = parseMetadataJson(await readFile("skills/manifest.json"));
validateManifest(manifest, await readFile("skills/inclusion-list.md"));
const report = auditSources(
  manifest,
  gitSnapshot(values.source, config.source.commit),
  config.source,
);
const bytes = metadataJsonBytes(report);
if (values.check) {
  if (!bytes.equals(await readFile(values.output)))
    throw new Error(
      "source audit differs from committed fixed-commit evidence",
    );
} else await writeFile(values.output, bytes);
process.stdout.write(
  metadataJsonBytes({
    members: report.memberCount,
    files: report.fileCount,
    bytes: report.totalBytes,
    affectedMembers: report.entries.filter((e) => e.issues.length).length,
    evaluations: report.entries.filter((e) => e.evaluation).length,
  }),
);
