import { parseMetadataJson, metadataJsonBytes } from "./lib/metadata-json.mjs";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import {
  parseReleaseConfig,
  inspectSubmission,
  prepareSubmission,
  submissionSnapshot,
} from "./lib/authoring.mjs";
import { buildCatalog } from "./lib/build.mjs";
import { writeBundle } from "./lib/bundle.mjs";
import { utf8Compare } from "./lib/common.mjs";

const { values } = parseArgs({
  options: {
    manifest: { type: "string", multiple: true, default: [] },
    source: { type: "string", multiple: true, default: [] },
    reviews: { type: "string" },
    output: { type: "string" },
  },
});
if (!values.manifest.length || !values.source.length)
  throw new Error(
    "--manifest <release.config.json> and --source <local Git clone> are required",
  );
if (values.manifest.length !== values.source.length)
  throw new Error("each --manifest requires a matching --source in order");
if (Boolean(values.reviews) !== Boolean(values.output))
  throw new Error("local builds require both --reviews and --output");
const submissions = [];
const ids = new Set();
for (const [index, path] of values.manifest.entries()) {
  const manifest = parseReleaseConfig(await readFile(path));
  if (ids.has(manifest.id))
    throw new Error(`duplicate current Skill ID: ${manifest.id}`);
  ids.add(manifest.id);
  submissions.push({ manifest, source: values.source[index] });
}
submissions.sort((a, b) => utf8Compare(a.manifest.id, b.manifest.id));
if (!values.output) {
  const entries = submissions.map(({ manifest, source }) => {
    const snapshot = submissionSnapshot(source, manifest);
    const { reviewInput } = inspectSubmission(manifest, snapshot);
    return [`${manifest.id}@${manifest.version}`, reviewInput];
  });
  process.stdout.write(metadataJsonBytes(Object.fromEntries(entries)));
} else {
  const reviews = parseMetadataJson(await readFile(values.reviews));
  const config = parseMetadataJson(await readFile("marketplace.config.json"));
  const candidates = submissions.map(({ manifest, source }) =>
    prepareSubmission(
      manifest,
      submissionSnapshot(source, manifest),
      reviews,
      config,
    ),
  );
  const built = buildCatalog(candidates, { marketplace: config.marketplace });
  await writeBundle(values.output, built);
  console.log(
    JSON.stringify({
      revision: built.root.revision,
      members: candidates.length,
      signed: false,
    }),
  );
}
