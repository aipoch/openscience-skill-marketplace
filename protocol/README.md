# OpenScience Skill Protocol v1 (unpublished)

This is an independent Skill protocol. It does not extend or modify Specialist
Protocol v1. The initial contract includes optional authors and upstream
self-assessment evidence. Production adoption freezes this contract: unknown
fields are rejected, so later additions need an explicit version/gating decision.

JSON uses UTF-8, two-space indentation and a final LF. Digests and Ed25519
signatures authenticate exact bytes, never reserialized equivalents.

## Discovery, details and retained history

Logical published paths:

```text
marketplace.json
marketplace.json.sig
snapshots/<revision>/marketplace.json
snapshots/<revision>/marketplace.json.sig
indexes/<sha256>.json
releases/<skill-id>/<version>.json
shards/<sha256>.zip
```

The root is a shallow current listing, with identity, display metadata, publisher,
source, license expression, optional authors/evaluation, immutable descriptor
reference, and shard/Skill digests. It contains no package content or full history.
An authenticated release index separately references every retained descriptor.
Descriptors contain reviewed license evidence, exact provenance, package metrics,
and a complete Skill's shard/subpath association. One current version appears per ID.

Schemas are in `schemas/`; schema `$id` values identify contracts, not deployed
HTTP endpoints. `validateDocument` also enforces numeric relationships, immutable
source/report links, duplicate identities, and ID/version/path consistency.
`verifyCatalog` checks the complete root → index → descriptor → shard digest chain.
The release index is strict `{ schema_version: 1, releases: [{ path, sha256 }] }`,
with unique paths, at most 10,000 entries and an 8 MiB byte limit. Root and descriptor
limits are 4 MiB and 1 MiB. Tooling bounds a loaded catalog to 1 GiB. A root's `revision` is SHA-256 of its canonical publisher
JSON after omitting the `revision` field; rebuilding identical input yields the
same snapshot identity. The signed `previous_revision` is the parent root hash (null
for the first snapshot), retained unchanged on retries so a later workflow can
finish a partially promoted snapshot. Property order is part of the publisher serialization.

Unchanged ID/version descriptors remain byte-identical, including their old shard
association. Updating a neighboring Skill must not repack an old descriptor.
Old descriptors and every referenced shard remain available through the index.
Changing immutable release metadata or package bytes requires a new version.

## Trust and transport

Pin the official Ed25519 public SPKI DER key outside downloaded metadata. The
signature envelope includes its key ID and public key, but cannot replace that
pin. Production also checks the public-key SHA-256 fingerprint against independent
protected configuration. No production pin or discovery endpoint is live yet.

The planned official GitHub discovery root is the `published` branch of
`aipoch/openscience-skill-marketplace`; use one resolved Git commit when fetching
the root/signature pair. Each batch has a GitHub Release named `catalog-<revision>`.
Every immutable logical object is attached under a deterministic filename:
SHA-256 of its UTF-8 logical path, followed by `.zip`, `.sig`, or `.json`.
For example, the immutable download URL is constructed as
`https://github.com/aipoch/openscience-skill-marketplace/releases/download/catalog-<revision>/<asset-name>`.
The CDN uses the logical paths directly beneath the separately configured
`/open-science/skill-marketplace/v1/` prefix. Both transports must yield equal bytes.

Clients verify the pinned root signature and schema, release-index digest,
descriptor digest/schema, then shard and Skill content digests. Never select a
Skill by name alone or trust the ZIP subpath without the verified descriptor.
GitHub/CDN fallback must preserve these checks. A stable CDN root and signature
are two objects: a promotion can briefly expose a mismatched pair. Retry a bounded
number of times or use the last verified snapshot; never accept a mismatched pair.
The immutable snapshot pair is available for stable references.

Signatures establish authenticity, not freshness. V1 has no trusted timestamp or
monotonic anti-rollback counter; signed historical snapshots can be replayed.
Production client freshness/rollback policy remains an explicit integration decision.

## Content digest and resource contract

For each regular file relative to a Skill root, sort by unsigned UTF-8 path bytes.
Initialize SHA-256 with `OpenScience Skill content digest v1` and a zero byte.
For each file append: uint64 big-endian path-byte length, UTF-8 path bytes,
uint64 big-endian content length, and exact content bytes. ZIP metadata, timestamps,
file modes and explicit directory entries are excluded. This matches the
[existing Skill content digest convention](https://github.com/aipoch/openscience-specialist-marketplace/blob/7215c1d8192025286d8f9a3f76b563342c550140/protocol/README.md).

The ZIP contains `<skill-id>/SKILL.md` and that Skill's regular files, without
explicit directory entries. Files/Skills are sorted; DOS ZIP time is fixed to
1980-01-01 00:00:00 in local calendar fields. Compression uses pinned fflate.

| Limit                                               | Maximum |
| --------------------------------------------------- | ------: |
| One file                                            |  50 MiB |
| One Skill expanded                                  | 128 MiB |
| Files per Skill                                     |  16,384 |
| Archive directory depth, including the Skill prefix |       8 |
| Aggregate SKILL.md preview bytes per shard          |   4 MiB |
| Shard compressed                                    |  64 MiB |
| Shard expanded                                      | 256 MiB |
| Shard file entries                                  |  32,768 |
| Skills per shard                                    |     128 |

Directory depth counts separators: `<id>/a/b/c/d/e/f/g/file.txt` has eight
directory levels and is accepted; one more directory is rejected.

The shard limits are deliberately tighter than the App's 256 MiB compressed
bundle and 256-Skill caps. A Skill never spans shards. Both expanded budgets and
actual compressed bytes govern partitioning. An individually oversized Skill
fails the complete build. Native root `.source.json` and `.specialist-package.json`
(case insensitive), traversal, symlinks, special files, nested Skill roots,
case/Unicode collisions, file/directory conflicts and nonportable paths are rejected.

## App field mapping

`toAppEntry` in `scripts/lib/protocol.mjs` provides the reviewed wire-to-display
mapping without modifying the App repository.

| Wire                                            | Existing App model                             |
| ----------------------------------------------- | ---------------------------------------------- |
| `display_name`, `inclusion_tier`                | `displayName`, `inclusionTier`                 |
| category slug                                   | existing English category label                |
| `version`                                       | Marketplace package `version`                  |
| `publisher`                                     | accountable publisher; separate from `authors` |
| `source.repository/commit/path`                 | original content provenance                    |
| listing `license` / detail `license.expression` | display `license`                              |
| `evaluation.max_score/report_url`               | `maxScore/reportUrl`                           |
| `evaluated_on/evaluator_version/skill_version`  | `evaluatedOn/evaluatorVersion/skillVersion`    |
| `static_score/dynamic_score`                    | `staticScore/dynamicScore`                     |

`evaluation.kind` is always `upstream-self-assessment`. The source report's
`final.score/final.max` are preserved exactly; optional subtotals do not replace the
final score. Report URLs must match the selected Skill's exact source commit/path.
No assessed Skill version is inferred from the package carrying a report. No score
leaderboard or App endorsement is introduced.
