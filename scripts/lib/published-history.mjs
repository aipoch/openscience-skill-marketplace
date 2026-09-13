import { gitSnapshot } from "./source.mjs";
import { loadCatalog, verifyCatalog } from "./build.mjs";
import { verifyRoot } from "./signing.mjs";

export function publishedMetadata(state, repository = process.cwd()) {
  const snapshot = gitSnapshot(repository, state.commit);
  return snapshot.read(
    snapshot.files
      .filter((f) => /\.(json|sig)$/.test(f.path))
      .map((f) => f.path),
  );
}

export function authenticateHistory(state, pin) {
  if (
    !pin ||
    !verifyRoot(state.rootBytes, JSON.parse(state.signatureBytes), pin)
  )
    throw new Error("published history requires a matching independent pin");
  return JSON.parse(state.rootBytes);
}

export async function publicationParent(candidate, metadata, pin) {
  const revision = candidate.root.previous_revision;
  if (revision === null) return undefined;
  const rootBytes = metadata.get(`snapshots/${revision}/marketplace.json`);
  const signatureBytes = metadata.get(
    `snapshots/${revision}/marketplace.json.sig`,
  );
  if (!rootBytes || !signatureBytes)
    throw new Error("missing signed publication parent");
  authenticateHistory({ rootBytes, signatureBytes }, pin);
  const history = await loadCatalog(
    rootBytes,
    async (p) => candidate.objects.get(p) ?? metadata.get(p),
  );
  return { ...history, signature: JSON.parse(signatureBytes) };
}

export async function loadPublishedCatalog({
  state,
  pin,
  cached,
  metadata,
  readArtifact,
}) {
  authenticateHistory(state, pin);
  if (cached?.rootBytes.equals(state.rootBytes)) {
    verifyCatalog(cached);
    return { candidate: cached, artifactDownloads: 0, cached: true };
  }
  let artifactDownloads = 0;
  const candidate = await loadCatalog(
    state.rootBytes,
    async (relative, options) => {
      if (metadata.has(relative)) return metadata.get(relative);
      if (!relative.startsWith("shards/"))
        throw new Error(`missing published metadata: ${relative}`);
      artifactDownloads++;
      return readArtifact(relative, options);
    },
  );
  return { candidate, artifactDownloads, cached: false };
}
