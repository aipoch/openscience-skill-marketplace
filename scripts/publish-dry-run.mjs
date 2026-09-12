import { metadataJsonBytes } from "./lib/metadata-json.mjs";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCatalog } from "./lib/build.mjs";
import { signRoot } from "./lib/signing.mjs";
import { directoryStore, publishSnapshot } from "./lib/publish.mjs";
import { makeCandidate } from "../test/fixtures.mjs";
const directory = await mkdtemp(
  path.join(os.tmpdir(), "openscience-skill-dry-run-"),
);
try {
  const candidate = buildCatalog([
    makeCandidate("example-one"),
    makeCandidate("example-two"),
  ]);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pin = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const signature = signRoot(candidate.rootBytes, {
    privateKey,
    expectedPublicKey: pin,
    keyId: "openscience-skills-dry-run",
  });
  const github = await directoryStore(path.join(directory, "github")),
    cdn = await directoryStore(path.join(directory, "cdn"));
  process.stdout.write(
    metadataJsonBytes(
      await publishSnapshot({ candidate, signature, pin, github, cdn }),
    ),
  );
  process.stdout.write(
    metadataJsonBytes(
      await publishSnapshot({ candidate, signature, pin, github, cdn }),
    ),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
