# Submit a Skill

A provider supplies one `release.config.json` referencing a committed Skill
directory in a GitHub repository. The Marketplace stores the authoring metadata;
the complete payload remains in its upstream Git repository. A maintainer can
track a submission at `authoring/submissions/<id>/release.config.json` after review.
There is no automatic discovery or production inclusion of files in that directory.

Copy [the example](example/release.config.json) and replace every placeholder.
Its zero commit is deliberately nonexistent; it cannot be ingested or published.
The [strict schema](release.config.schema.json) rejects unknown fields.

| Field               | Required | Meaning                                                                                                                                                    |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`    | Yes      | `1`, the provider input format version.                                                                                                                    |
| `id`                | Yes      | Lowercase kebab-case, at most 128 characters; must equal `SKILL.md` frontmatter `name`.                                                                    |
| `version`           | Yes      | Marketplace package SemVer, for example `1.0.0`; independent of upstream tags and immutable once published.                                                |
| `category`          | Yes      | `Academic Writing`, `Data Analysis`, `Evidence Insight`, `Other`, or `Protocol Design`. Used for catalog display and filtering.                            |
| `display_name`      | No       | Human-readable title, at most 500 characters; defaults to `id`.                                                                                            |
| `source.repository` | Yes      | HTTPS GitHub repository URL, for example `https://github.com/organization/skills`.                                                                         |
| `source.commit`     | Yes      | Full lowercase 40-character commit SHA; branches and tags are rejected.                                                                                    |
| `source.path`       | Yes      | Repository-relative directory containing the exact `SKILL.md`, for example `skills/example-skill`.                                                         |
| `license_files`     | Yes      | 1–20 distinct repository-relative paths to actual license evidence in that commit, possibly outside the Skill directory. The tool calculates their hashes. |

Paths use `/`, without a leading slash, `..`, backslashes or non-portable names.
Category values match the App model exactly; no slug conversion or translation
occurs during intake. For example, `Data Analysis` is valid and its former slug
is rejected. Display localization belongs to the App.
The Skill must occupy a subdirectory; repository-root Skills are not supported by
the existing source-path contract. Each evidence file must be a nonempty regular
file of at most 4 MiB.

## Skill content

The referenced directory contains `SKILL.md` with YAML frontmatter:

```markdown
---
name: example-skill
description: Explain what the Skill does and when to use it.
license: MIT
---

Instructions for using the Skill, followed by any required documentation.
```

`name` and `description` are required nonempty strings. A per-Skill license
declaration at `license` or `metadata.license` is the primary declaration when
present. Include that `SKILL.md` in `license_files` when it establishes the
package-specific declaration. A different repository-root license alone does not
reject or relabel the Skill; retain applicable root and third-party notices with
their own scope. Preserve non-SPDX labels verbatim rather than inferring a variant.
Naming a license does not establish permission for unrelated third-party content. An entirely absent
declaration may proceed to manual evidence review as described below. Empty, null
or malformed declarations are rejected. A nonempty author string at `author`,
`metadata.author` or `metadata.skill-author` is preserved as an attribution claim
for the maintainer to verify. Description and author limits are 10,000 and 500
characters respectively. A license declaration is limited to 500 characters.

Include all required scripts, references, assets and notices under the Skill
directory. Intake reads Git blobs and never executes imported code. It checks
the existing package limits: 50 MiB per file, 128 MiB per Skill, 16,384 files,
eight path segments and a 4 MiB `SKILL.md` preview. Symlinks, submodules, nested
Skills, reserved App files and case-colliding paths are rejected. Content is not
silently removed to fit a limit. List required license notices in `license_files`,
including evidence outside the Skill directory. After review, the builder retains
those external notices under `LICENSES/<sha256>.txt` in the distributed package;
files already inside the directory keep their original paths.

Providers do **not** submit `eval_report_*`, `evaluation`, `inclusionTier`,
`collection`, publisher identity, signatures, hashes or shard/download locations.
This intake path does not interpret assessment-like filenames. If such files
already exist in the selected directory, they remain ordinary payload files and
do not produce a catalog evaluation. The historical 584-member audit retains its
existing assessment handling separately.

## Validate and prepare review input

Use a trusted local clone of the declared upstream repository with the pinned
commit available. HTTPS and standard GitHub SSH origins are accepted. Intake
checks the origin to catch a wrong-clone mistake; a local origin setting is not
proof of ownership or permission. The maintainer must obtain the source from the
declared repository and review its provenance. The tool does not fetch, checkout,
or execute source content, and ignores working-tree changes.

From the Marketplace repository root:

```bash
npm run --silent intake:skill -- \
  --manifest /path/to/release.config.json \
  --source /path/to/upstream-clone > /tmp/skill-review-input.json
```

The command validates the manifest, source identity, metadata, package and license
evidence, then prints a JSON map keyed by `<id>@<version>`. It includes computed
content/evidence hashes, source repository/commit/path, license declaration and
package metrics. `manifest_sha256` binds the authored metadata using the tool's
JSON serialization; regenerate review input after any manifest edits, including
key reordering. This output is **not approval** and contains no reviewer identity
or approval date.

## Maintainer review and local build

Review the source, attribution, license scope, bundled notices and exact package
bytes. Copy the generated JSON map to a local review file and add `reviewed_by`
and `reviewed_on` (`YYYY-MM-DD`) to the version's record only after that review.
The build retains reviewed external license evidence under
`LICENSES/<sha256>.txt`; evidence inside the Skill remains at its original path.
Review-input hashes and metrics describe the source directory. Published package
hashes and metrics also include added license files. See
[license packaging](../skills/README.md#review-records) for collision, size and
notice-retention rules. Preserve the complete required notices when selecting
evidence; copying an unrelated license does not approve third-party content.

An unsupported license additionally requires `exception_reason` under the existing
[review policy](../skills/README.md). Existing default reviewed expressions are
MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC and CC0-1.0.

When both upstream license fields are absent, intake omits `license_expression`.
A maintainer must explicitly set it to `Unknown` and add an `exception_reason`
explaining the verified redistribution evidence and its scope. All source,
manifest and evidence hashes, reviewer identity and review date remain required.
`Unknown` records missing metadata; it is not permission to redistribute. Do not
use this path to override an existing declaration, resolve conflicting notices,
or substitute an unrelated repository license. The original `SKILL.md` remains
byte-for-byte unchanged.

```bash
npm run intake:skill -- \
  --manifest /path/to/release.config.json \
  --source /path/to/upstream-clone \
  --reviews /path/to/reviewed-submission.json \
  --output dist/submission-example
```

Both `--reviews` and `--output` are required for a build. The command revalidates
the manifest and exact reviewed source/evidence, uses the platform publisher in
`marketplace.config.json`, and calls the existing deterministic catalog builder.
It writes an **unsigned local catalog** with release metadata, a release
index and ZIP shard. Use a dedicated output directory. Repeating unchanged input
produces identical bytes; conflicting immutable files in an existing output are
rejected. A source or authored metadata change requires review again.

## Batch intake

Repeat `--manifest` and `--source` to select multiple Skills explicitly. The first
manifest uses the first source, the second uses the second source, and so on.
Supply one source per manifest, repeating the same clone path for Skills from a
shared repository. Each manifest still pins its own repository, commit and path.
The command does not discover submissions automatically or fetch repositories.

```bash
npm run --silent intake:skill -- \
  --manifest /path/to/alpha/release.config.json --source /path/to/shared-clone \
  --manifest /path/to/beta/release.config.json --source /path/to/shared-clone \
  --manifest /path/to/gamma/release.config.json --source /path/to/another-clone \
  > /tmp/batch-review-input.json
```

This emits one combined review map, sorted by Skill ID. No review JSON is emitted
if any selected submission fails validation. Check the command's exit status;
shell redirection can still create an empty file on failure. Each ID may appear
only once, including when manifests specify different versions of that ID.

Review each record as described above, then supply the completed review file and
an output directory with the same selection:

```bash
npm run intake:skill -- \
  --manifest /path/to/alpha/release.config.json --source /path/to/shared-clone \
  --manifest /path/to/beta/release.config.json --source /path/to/shared-clone \
  --manifest /path/to/gamma/release.config.json --source /path/to/another-clone \
  --reviews /path/to/reviewed-batch.json --output dist/submission-batch
```

Every selected Skill must pass validation and exact-byte review before bundle
writing starts. The existing builder creates one unsigned snapshot with bounded
ZIP shards containing the entire selection. Reordering manifest/source pairs
does not change the review input or built bytes. Invalid members are not skipped.
Filesystem failures during bundle writing retain the existing retry and immutable
conflict behavior; the output directory is not a transactional filesystem commit.
The original single-manifest command remains valid.

## Production and batch publication

`intake:skill` produces unsigned local artifacts only. Production enrollment is
explicitly maintained in [`production.json`](production.json): `schema_version: 1`
and a `releases` array of the same strict release-config objects described above.
The register selects 465 original members and 60 provider Skills: 23 K-Dense,
26 NVIDIA BioNeMo, one Google DeepMind, nine Nature and one Medical entry. Ten releases
with absent per-Skill license declarations have explicit `Unknown` reviews with
retained license evidence. Five database Skills additionally preserve their original
K-Dense `Unknown` declarations, authors and MIT evidence at
`71add644263a56368f8680d68df504c6674dc1e5`. Earlier releases keep their exact
sources. Review records remain in `skills/reviews.json` and bind every
provider's manifest, source and license bytes. A registration without approved
review evidence fails the build.

Registered Skill IDs must be unique and disjoint from the selected original
members. An ID deferred in the historical manifest and never published may
explicitly select a reviewed provider source. Two IDs cannot register the same
provider directory.
Do not rename an existing Skill to evade this gate: check semantic duplicates
and original-name aliases during maintainer review. The original authority and
its deferrals remain unchanged as observations of those original source bytes.
Authenticated publication history prevents replacing the repository or directory
of any published ID, including retained releases absent from the current listing.
A new commit from the same source still requires a reviewed package version;
immutable published releases cannot be overwritten. Files under `authoring/submissions/` are never
automatically enrolled. Adding a new provider remains a maintainer decision.

The shared validation/publication commands read this explicit register:

```bash
node scripts/fetch-selected-sources.mjs --source dist/upstream
npm run build:catalog -- --source dist/upstream
```

Fetch stores each provider's Git objects under `dist/providers/<repository-sha256>`
and verifies its configured origin and fixed commits, without checking out or
executing its files. A cached commit is reused. Both commands accept
`--providers /path/to/provider-cache` to change that local cache directory.
Repository-specific clones prevent one source from being mistaken for another.
Ordinary Git transport URL rewrites are allowed; identity checks use the declared
remote URL before transport rewriting.

The builder combines the original selection with reviewed provider candidates in
one catalog. Publication checks the exact combined IDs, versions and source
repository/commit/path before signing. The protected main workflow and production
authorization are still required. The existing signed-history build and incremental
publication preserve previously released bytes and upload only new immutable
objects plus the updated catalog metadata.

Consumers continue reading
`https://statics.aipoch.com/open-science/skill-marketplace/v1/marketplace.json`.
Provider origins do not change the Skill Protocol v1 download routes or require
an App model change. Provider payloads are packaged into the same bounded CDN
ZIP shards as original members.

## Compatibility and storage

Repository-owned JSON fields use `snake_case`, including earlier Marketplace
configuration, manifests, audits, reviews and build context. Former camelCase
fields are rejected; there is no compatibility reader or migration adapter.
Former category slugs are also rejected; use the five exact category values above.
Regenerate local review input and rebuild local candidates using the current
format. Manifest hashes bind the snake_case serialization. JavaScript models
remain camelCase after boundary conversion, and filenames are unchanged.

Provider input is a new authoring contract, separate from the unchanged public
Skill Protocol v1. It adds no categories, App installation states, database
migrations or historical compatibility adapter. The production register and approved review metadata are committed to
Marketplace Git; payloads stay upstream; generated review material and local
bundles stay local until deliberately reviewed and promoted. Do not commit local
plans, generated bundles, credentials or fabricated approval records.

## Independent providers

Providers and authors do not have to be AIPOCH. Keep the actual upstream
repository, immutable commit/path and original author credits in the submission;
the Marketplace config supplies its separate publisher identity. Provider intake
supports multiple source repositories. Production inclusion requires explicit
registration and approval through the production workflow above.

Include all required third-party notices in the submitted Git snapshot and list
them in `license_files`. The supplemental copies used by the historical catalog
are maintainer-controlled repository inputs; `additional_license_files` is not
part of the provider manifest, and intake rejects this field in review records
rather than ignoring notices. See [catalog review records](../skills/README.md#original-notices-from-another-repository).

## Third-party review queue

[`submissions/index.json`](submissions/index.json) tracks 192 candidate records
from five source providers. Each referenced release config uses the existing
**authoring v1** format. Provider identity belongs to the queue index, where
`<provider-id>/<skill-id>@<version>` identifies each candidate independently.
This queue key is not an intake review key or a public Skill ID.

Inspect same-name alternatives in separate intake invocations and review files;
`intake:skill` continues using `<skill-id>@<version>` and rejects duplicate Skill
IDs in a batch. Select and review one eligible source before production enrollment.
Do not combine same-name alternatives by overwriting review records. The queue
does not alter existing authoring, production, or public protocol versions.

Queue validation checks config references, provider/source identities, counters,
states and runtime-ID collisions against the selected originals and production
register. License blockers and review flags are recorded review observations;
index validation does not inspect upstream license bytes or grant approval.

Ordinary PR CI validates and builds the registered production selection without
publishing. After approved enrollment, the protected `publish.yml` Action fetches
the selected upstream Git commits, reads the exact Skill directories, verifies
review evidence, builds ZIP shards and signed metadata, then uploads new immutable
objects and updates the CDN catalog. Existing published objects are reused.
Queue entries are neither fetched nor published automatically. ZIP URLs come from
the catalog's release metadata (`shards/<sha256>.zip`); there is no per-provider
upload or fixed `skill.zip` URL. See [publication](../docs/publication.md).
