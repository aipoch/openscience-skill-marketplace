import { metadataJsonBytes } from "./lib/metadata-json.mjs";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCatalog } from "./lib/build.mjs";
import {
  selectReleaseEntries,
  assertReleaseSelection,
} from "./lib/release-plan.mjs";
import { signRoot } from "./lib/signing.mjs";
import { directoryStore, publishSnapshot } from "./lib/publish.mjs";
import { makeCandidate } from "../test/fixtures.mjs";
const directory = await mkdtemp(
  path.join(os.tmpdir(), "openscience-skill-dry-run-"),
);
try {
  const inputs = ["example-one", "example-two", "deferred-example"].map((id) =>
    makeCandidate(id),
  );
  const entries = inputs.map(({ skill }) => ({
    id: skill.id,
    version: skill.version,
    sourcePath: skill.source.path,
  }));
  const { repository, commit } = inputs[0].skill.source;
  const source = { repository, commit };
  const identity = ({ id, version }) => ({ id, version });
  const selected = selectReleaseEntries(
    metadataJsonBytes({
      schemaVersion: 1,
      source,
      selected: entries.slice(0, 2).map(identity),
      deferred: [
        { ...identity(entries[2]), reason: "Test-only explicit deferral" },
      ],
    }),
    entries,
    source,
  );
  const previous = buildCatalog([inputs[0]]);
  const candidate = buildCatalog(
    inputs.filter((c) => selected.some((e) => e.id === c.skill.id)),
    { history: previous.objects, previousRoot: previous.root },
  );
  assertReleaseSelection(candidate.root, selected, source);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pin = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const sign = (bytes) =>
    signRoot(bytes, {
      privateKey,
      expectedPublicKey: pin,
      keyId: "openscience-skills-dry-run",
    });
  const signature = sign(candidate.rootBytes);
  const history = { ...previous, signature: sign(previous.rootBytes) };
  const github = await directoryStore(path.join(directory, "github")),
    cdn = await directoryStore(path.join(directory, "cdn"));
  await publishSnapshot({
    candidate: previous,
    signature: history.signature,
    pin,
    github,
    cdn,
  });
  process.stdout.write(
    metadataJsonBytes(
      await publishSnapshot({
        candidate,
        signature,
        pin,
        github,
        cdn,
        history,
      }),
    ),
  );
  process.stdout.write(
    metadataJsonBytes(
      await publishSnapshot({
        candidate,
        signature,
        pin,
        github,
        cdn,
        history,
      }),
    ),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
