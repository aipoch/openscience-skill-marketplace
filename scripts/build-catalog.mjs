import { parseMetadataJson, metadataJsonBytes } from "./lib/metadata-json.mjs";
import { parseArgs } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { validateManifest } from "./lib/catalog.mjs";
import { auditSources, gitSnapshot } from "./lib/source.mjs";
import { prepareCandidates } from "./lib/prepare.mjs";
import { selectReleaseEntries } from "./lib/release-plan.mjs";
import { buildCatalog } from "./lib/build.mjs";
import { readBundle, writeBundle } from "./lib/bundle.mjs";
const { values } = parseArgs({
  options: {
    source: { type: "string" },
    output: { type: "string", default: "dist/candidate" },
    history: { type: "string" },
  },
});
if (!values.source)
  throw new Error("--source <local upstream Git repository> is required");
const config = parseMetadataJson(await readFile("marketplace.config.json"));
const manifest = parseMetadataJson(await readFile("skills/manifest.json"));
validateManifest(manifest, await readFile("skills/inclusion-list.md"));
const snapshot = gitSnapshot(values.source, config.source.commit);
const audit = auditSources(manifest, snapshot, config.source);
const selected = selectReleaseEntries(
  await readFile("skills/release_plan.json"),
  audit.entries,
  config.source,
);
const reviews = parseMetadataJson(await readFile("skills/reviews.json"));
await mkdir(values.output, { recursive: true });
try {
  const candidates = prepareCandidates(
    { entries: selected },
    reviews,
    config,
    snapshot,
  );
  let history;
  if (values.history) {
    if (!process.env.SKILL_MARKETPLACE_PUBLIC_KEY)
      throw new Error("history requires SKILL_MARKETPLACE_PUBLIC_KEY");
    history = await readBundle(values.history, {
      pin: process.env.SKILL_MARKETPLACE_PUBLIC_KEY,
    });
  }
  const built = buildCatalog(candidates, {
    history: history?.objects,
    previousRoot: history?.root,
    marketplace: config.marketplace,
  });
  await writeBundle(values.output, built);
  await writeFile(
    `${values.output}/build-context.json`,
    metadataJsonBytes({ baseRevision: built.root.previous_revision }),
  );
  console.log(
    JSON.stringify({
      revision: built.root.revision,
      members: built.root.skills.length,
      objects: built.objects.size,
    }),
  );
} catch (error) {
  await writeFile(
    `${values.output}/publication-blockers.json`,
    metadataJsonBytes({
      message: error.message,
      blockers: error.blockers ?? [],
    }),
  );
  console.error(error.message);
  process.exitCode = 1;
}
