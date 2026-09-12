import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import {
  inspectSubmission,
  prepareSubmission,
  submissionSnapshot,
} from "./lib/authoring.mjs";
import { buildCatalog } from "./lib/build.mjs";
import { writeBundle } from "./lib/bundle.mjs";
import { jsonBytes } from "./lib/common.mjs";

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    source: { type: "string" },
    reviews: { type: "string" },
    output: { type: "string" },
  },
});
if (!values.manifest || !values.source)
  throw new Error(
    "--manifest <release.config.json> and --source <local Git clone> are required",
  );
if (Boolean(values.reviews) !== Boolean(values.output))
  throw new Error("local builds require both --reviews and --output");
const manifest = JSON.parse(await readFile(values.manifest));
const snapshot = submissionSnapshot(values.source, manifest);
if (!values.output) {
  const { reviewInput } = inspectSubmission(manifest, snapshot);
  process.stdout.write(
    jsonBytes({ [`${manifest.id}@${manifest.version}`]: reviewInput }),
  );
} else {
  const reviews = JSON.parse(await readFile(values.reviews));
  const config = JSON.parse(await readFile("marketplace.config.json"));
  const candidate = prepareSubmission(manifest, snapshot, reviews, config);
  const built = buildCatalog([candidate], { marketplace: config.marketplace });
  await writeBundle(values.output, built);
  console.log(
    JSON.stringify({
      revision: built.root.revision,
      members: 1,
      signed: false,
    }),
  );
}
