import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { gitSnapshot } from "./lib/source.mjs";
import { inspectSkill, LIMITS } from "./lib/package.mjs";
import { assertPath, sha256, jsonBytes } from "./lib/common.mjs";
const { values } = parseArgs({
  options: {
    source: { type: "string" },
    id: { type: "string" },
    "license-path": { type: "string", multiple: true, default: [] },
  },
});
if (!values.source || !values.id)
  throw new Error("--source and --id are required");
const config = JSON.parse(await readFile("marketplace.config.json"));
const manifest = JSON.parse(await readFile("skills/manifest.json"));
const entry = manifest.entries.find((e) => e.id === values.id);
if (!entry) throw new Error("ID is not in the approved manifest");
const snapshot = gitSnapshot(values.source, config.source.commit);
const selected = snapshot.files.filter((f) =>
  f.path.startsWith(entry.sourcePath + "/"),
);
if (
  selected.length > LIMITS.maxFiles ||
  selected.some((f) => f.size > LIMITS.maxFileBytes) ||
  selected.reduce((n, f) => n + f.size, 0) > LIMITS.maxSkillBytes
)
  throw new Error(
    "source package exceeds resource limits; review a corrected upstream package",
  );
const contents = snapshot.read(selected.map((f) => f.path));
const metrics = inspectSkill({
  id: entry.id,
  files: selected.map((f) => ({
    path: f.path.slice(entry.sourcePath.length + 1),
    mode: f.mode,
    bytes: contents.get(f.path),
  })),
});
const evidence = values["license-path"].map((p) => {
  assertPath(p);
  const file = snapshot.files.find((f) => f.path === p);
  if (
    !file ||
    !["100644", "100755"].includes(file.mode) ||
    file.size > 4 * 1024 * 1024
  )
    throw new Error("license evidence must be a bounded regular file");
  return { path: p, sha256: sha256(snapshot.read([p]).get(p)) };
});
process.stdout.write(
  jsonBytes({
    id: entry.id,
    version: entry.version,
    sourceCommit: config.source.commit,
    sourcePath: entry.sourcePath,
    contentSha256: metrics.contentSha256,
    fileCount: metrics.fileCount,
    totalBytes: metrics.totalBytes,
    licenseFiles: evidence,
  }),
);
