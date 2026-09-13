import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseMetadataJson } from "./lib/metadata-json.mjs";
import { selectReleaseEntries } from "./lib/release-plan.mjs";
import { validateManifest } from "./lib/catalog.mjs";

const { values } = parseArgs({ options: { source: { type: "string" } } });
if (!values.source)
  throw new Error("--source <local upstream Git repository> is required");
const config = parseMetadataJson(await readFile("marketplace.config.json"));
const manifest = parseMetadataJson(await readFile("skills/manifest.json"));
validateManifest(manifest, await readFile("skills/inclusion-list.md"));
const selected = selectReleaseEntries(
  await readFile("skills/release_plan.json"),
  manifest.entries,
  config.source,
);
const commits = new Set([
  config.source.commit,
  ...selected.map((entry) => entry.sourceCommit ?? config.source.commit),
]);
for (const commit of commits) {
  const args = ["-C", values.source];
  const existing = spawnSync("git", [...args, "cat-file", "-t", commit], {
    encoding: "utf8",
  });
  if (existing.error) throw existing.error;
  if (existing.status !== 0) {
    execFileSync(
      "git",
      [
        ...args,
        "fetch",
        "--no-tags",
        "--depth=1",
        config.source.repository,
        commit,
      ],
      { stdio: "inherit" },
    );
  }
  const type = execFileSync("git", [...args, "cat-file", "-t", commit], {
    encoding: "utf8",
  }).trim();
  if (type !== "commit")
    throw new Error("source must reference a Git commit object");
}
console.log(
  `Available: ${commits.size} fixed source commits; checkout unchanged.`,
);
