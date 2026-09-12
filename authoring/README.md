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
declaration is required at `license` or `metadata.license`; naming a license does
not establish redistribution permission. A nonempty author string at `author`,
`metadata.author` or `metadata.skill-author` is preserved as an attribution claim
for the maintainer to verify. Description and author limits are 10,000 and 500
characters respectively. A license declaration is limited to 500 characters.

Include all required scripts, references, assets and notices under the Skill
directory. Intake reads Git blobs and never executes imported code. It checks
the existing package limits: 50 MiB per file, 128 MiB per Skill, 16,384 files,
eight path segments and a 4 MiB `SKILL.md` preview. Symlinks, submodules, nested
Skills, reserved App files and case-colliding paths are rejected. Content is not
silently removed to fit a limit. Evidence outside the directory is linked in
metadata; it is not automatically copied into the package. Providers must include
any legally required notices in the distributed directory itself.

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

This command does not sign, upload, add catalog members or change production
configuration. The original 584-member manifest and all pending review/source
blockers remain intact. No real provider submissions are included in this change.
Migrating that manifest or admitting new members needs a separate inclusion
decision. A successful local build is not production eligibility.

The existing [publication workflow](../docs/publication.md) publishes a whole
catalog snapshot in one batch and creates bounded shards automatically. Provider
batch intake prepares local review material and unsigned catalogs; wiring
submissions into the production catalog still requires a separate inclusion
decision and is not performed by this command.

The Skill CDN route prefix remains `/open-science/skill-marketplace/v1/`.
If the Specialist origin is approved for Skills, the proposed discovery URL is
`https://statics.aipoch.com/open-science/skill-marketplace/v1/marketplace.json`.
That is a proposal, **not a live endpoint**. This change performs no CDN writes,
does not configure an origin/distribution, and does not change publication routing.

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
migrations or historical compatibility adapter. Metadata may be committed to
Marketplace Git; payloads stay upstream; generated review material and local
bundles stay local until deliberately reviewed and promoted. Do not commit local
plans, generated bundles, credentials or fabricated approval records.
