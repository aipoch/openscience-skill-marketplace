import { buildShards, inspectSkill } from "./package.mjs";
import { jsonBytes, sha256, utf8Compare, assertPath } from "./common.mjs";
import { validateDocument } from "./protocol.mjs";

export function buildCatalog(
  candidates,
  {
    history = new Map(),
    previousRoot,
    marketplace = {
      id: "openscience-skills",
      name: "OpenScience Skill Marketplace",
    },
  } = {},
) {
  if (!candidates.length) throw new Error("catalog must not be empty");
  const objects = new Map(history);
  const descriptors = new Map();
  const pending = [];
  const seen = new Set();
  for (const candidate of [...candidates].sort((a, b) =>
    utf8Compare(a.skill.id, b.skill.id),
  )) {
    const { skill, files } = candidate;
    if (seen.has(skill.id)) throw new Error("duplicate current Skill ID");
    seen.add(skill.id);
    const metrics = inspectSkill({ id: skill.id, files });
    const packageInfo = {
      content_sha256: metrics.contentSha256,
      file_count: metrics.fileCount,
      uncompressed_bytes: metrics.totalBytes,
    };
    const releasePath = `releases/${skill.id}/${skill.version}.json`;
    assertPath(releasePath);
    if (objects.has(releasePath)) {
      const old = validateDocument(
        "skill-release",
        JSON.parse(objects.get(releasePath)),
      );
      if (
        !jsonBytes(old.skill).equals(jsonBytes(skill)) ||
        !jsonBytes(old.package).equals(jsonBytes(packageInfo))
      )
        throw new Error(`immutable release changed: ${releasePath}`);
      const artifact = objects.get(old.artifact.path);
      if (
        !artifact ||
        sha256(artifact) !== old.artifact.sha256 ||
        artifact.length !== old.artifact.bytes
      )
        throw new Error(
          `missing or corrupt historical shard: ${old.artifact.path}`,
        );
      descriptors.set(skill.id, old);
    } else pending.push({ ...candidate, packageInfo, releasePath });
  }
  for (const shard of buildShards(
    pending.map((c) => ({ id: c.skill.id, files: c.files })),
  )) {
    const previous = objects.get(shard.path);
    if (previous && !previous.equals(shard.bytes))
      throw new Error("immutable shard conflict");
    objects.set(shard.path, shard.bytes);
    for (const metrics of shard.skills) {
      const candidate = pending.find((c) => c.skill.id === metrics.id);
      const descriptor = validateDocument("skill-release", {
        schema_version: 1,
        protocol: "openscience-skill-marketplace",
        skill: candidate.skill,
        package: candidate.packageInfo,
        artifact: {
          path: shard.path,
          sha256: shard.sha256,
          bytes: shard.bytes.length,
          skill_path: metrics.id,
        },
      });
      objects.set(candidate.releasePath, jsonBytes(descriptor));
      descriptors.set(metrics.id, descriptor);
    }
  }
  // One signed index authenticates retained versions without embedding history in shallow listings.
  for (const key of objects.keys())
    if (key.startsWith("indexes/")) objects.delete(key);
  const releases = [...objects.keys()]
    .filter((p) => p.startsWith("releases/"))
    .sort(utf8Compare)
    .map((path) => ({ path, sha256: sha256(objects.get(path)) }));
  const indexBytes = jsonBytes({ schema_version: 1, releases });
  const indexSha = sha256(indexBytes);
  const indexPath = `indexes/${indexSha}.json`;
  objects.set(indexPath, indexBytes);
  const skills = [...descriptors.values()]
    .sort((a, b) => utf8Compare(a.skill.id, b.skill.id))
    .map((d) => {
      const path = `releases/${d.skill.id}/${d.skill.version}.json`;
      return {
        ...d.skill,
        license: d.skill.license.expression,
        release: { path, sha256: sha256(objects.get(path)) },
        artifact: d.artifact,
        content_sha256: d.package.content_sha256,
      };
    });
  const body = {
    schema_version: 1,
    protocol: "openscience-skill-marketplace",
    marketplace,
    skills,
    release_index: { path: indexPath, sha256: indexSha },
  };
  if (previousRoot) {
    const { revision, previous_revision, ...previousBody } = previousRoot;
    if (jsonBytes(body).equals(jsonBytes(previousBody))) {
      const result = {
        root: previousRoot,
        rootBytes: jsonBytes(previousRoot),
        objects,
      };
      verifyCatalog(result);
      return result;
    }
  }
  body.previous_revision = previousRoot?.revision ?? null;
  const root = validateDocument("marketplace", {
    ...body,
    revision: sha256(jsonBytes(body)),
  });
  const rootBytes = jsonBytes(root);
  if (rootBytes.length > 4 * 1024 * 1024)
    throw new Error("discovery exceeds 4 MiB");
  const result = { root, rootBytes, objects };
  verifyCatalog(result);
  return result;
}

export function verifyCatalog({ rootBytes, objects }) {
  if (rootBytes.length > 4 * 1024 * 1024)
    throw new Error("discovery exceeds 4 MiB");
  const root = validateDocument("marketplace", JSON.parse(rootBytes));
  const { revision, ...body } = root;
  if (sha256(jsonBytes(body)) !== revision)
    throw new Error("snapshot revision mismatch");
  const reference = root.release_index;
  const indexBytes = objects.get(reference.path);
  if (
    reference.path !== `indexes/${reference.sha256}.json` ||
    !indexBytes ||
    sha256(indexBytes) !== reference.sha256 ||
    indexBytes.length > 8 * 1024 * 1024
  )
    throw new Error("invalid release index digest or size");
  const index = validateDocument("release-index", JSON.parse(indexBytes));
  const allowed = new Set([reference.path]);
  const releaseMap = new Map();
  for (const ref of index.releases) {
    if (
      Object.keys(ref).sort().join(",") !== "path,sha256" ||
      typeof ref.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(ref.sha256)
    )
      throw new Error("invalid release index entry");
    assertPath(ref.path);
    if (releaseMap.has(ref.path))
      throw new Error("duplicate release index entry");
    const bytes = objects.get(ref.path);
    if (!bytes || bytes.length > 1024 * 1024 || sha256(bytes) !== ref.sha256)
      throw new Error("release descriptor digest mismatch");
    const d = validateDocument("skill-release", JSON.parse(bytes));
    if (ref.path !== `releases/${d.skill.id}/${d.skill.version}.json`)
      throw new Error("release descriptor path mismatch");
    const archive = objects.get(d.artifact.path);
    if (
      !archive ||
      archive.length !== d.artifact.bytes ||
      sha256(archive) !== d.artifact.sha256
    )
      throw new Error("shard digest mismatch");
    allowed.add(ref.path);
    allowed.add(d.artifact.path);
    releaseMap.set(ref.path, d);
  }
  for (const listing of root.skills) {
    const d = releaseMap.get(listing.release.path);
    if (
      !d ||
      sha256(objects.get(listing.release.path)) !== listing.release.sha256
    )
      throw new Error("listing descriptor mismatch");
    const expected = {
      ...d.skill,
      license: d.skill.license.expression,
      release: listing.release,
      artifact: d.artifact,
      content_sha256: d.package.content_sha256,
    };
    if (!jsonBytes(expected).equals(jsonBytes(listing)))
      throw new Error("listing metadata differs from descriptor");
  }
  for (const p of objects.keys())
    if (!allowed.has(p)) throw new Error(`unreferenced snapshot object: ${p}`);
  return root;
}

export async function loadCatalog(rootBytes, read) {
  if (rootBytes.length > 4 * 1024 * 1024)
    throw new Error("root exceeds byte limit");
  const root = validateDocument("marketplace", JSON.parse(rootBytes));
  const { revision, ...body } = root;
  if (sha256(jsonBytes(body)) !== revision)
    throw new Error("root revision digest mismatch");
  const objects = new Map();
  let totalBytes = rootBytes.length;
  async function load(relative, digest, maxBytes) {
    assertPath(relative);
    const bytes = objects.get(relative) ?? (await read(relative, { maxBytes }));
    if (!bytes || bytes.length > maxBytes || sha256(bytes) !== digest)
      throw new Error(`object digest or size mismatch: ${relative}`);
    if (!objects.has(relative)) {
      totalBytes += bytes.length;
      if (totalBytes > 1024 * 1024 * 1024)
        throw new Error("catalog exceeds the 1 GiB tooling memory budget");
      objects.set(relative, bytes);
    }
    return bytes;
  }
  const index = validateDocument(
    "release-index",
    JSON.parse(
      await load(
        root.release_index.path,
        root.release_index.sha256,
        8 * 1024 * 1024,
      ),
    ),
  );
  for (const ref of index.releases) {
    const descriptor = validateDocument(
      "skill-release",
      JSON.parse(await load(ref.path, ref.sha256, 1024 * 1024)),
    );
    await load(
      descriptor.artifact.path,
      descriptor.artifact.sha256,
      descriptor.artifact.bytes,
    );
  }
  const candidate = { root, rootBytes, objects };
  verifyCatalog(candidate);
  return candidate;
}
