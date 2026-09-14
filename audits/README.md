# AIPOCH Skill Auditor evidence

AIPOCH audited the submitted third-party Skills using Skill Auditor. The upstream
repository owner is the provider; AIPOCH remains the Marketplace publisher and
audit operator. This is not an upstream vendor self-assessment or independent
certification. The same audit attribution applies to AIPOCH's own submitted Skills.

## Reviewed input

### Complete 776-member submission

[`full-inclusion.json`](full-inclusion.json) is the complete provider-qualified
input register: **776 Skill records and 776 score references from six repositories**.
It joins all 584 original manifest entries and all 192 third-party submission
configs. Upstream commit/path references are the repository's payload distribution
contract; this PR does not vendor a second copy of the Skill repositories or the
331 MB source ZIP. Every record additionally preserves the submitted `SKILL.md`
hash, report path/digest, numeric evaluation and source-review observations.

| Source                     | Skill records |
| -------------------------- | ------------: |
| AIPOCH                     |           584 |
| K-Dense-AI                 |            56 |
| NVIDIA-BioNeMo             |            31 |
| Synthetic Sciences         |            78 |
| Yuan1z0825 / Nature Skills |            20 |
| Google DeepMind            |             7 |
| Total                      |           776 |

Cross-provider same-name records remain distinct. There are 773 distinct report
byte sequences referenced by 776 records; content-addressed evidence reuse does
not deduplicate Skills. Twelve report names differ from their authoritative Skill
IDs; these are explicitly marked `identity_review_required`, not silently renamed
or approved. Source blockers, license reviews, deferrals and runtime-ID collisions
are not waived by a score. The complete register is a review input, not a claim
that all 776 are production-installable under the current globally unique v1 IDs.

Reproduce the complete register (reads archive contents, never executes them):

```sh
node scripts/import-full-aipoch-assessments.mjs \
  --archive /path/to/open-science-skills-20260911.zip
```

### Temporary publication holds

`skills/publication-holds.json` temporarily withholds **34 source records covering
24 Skill names**, including same-name copies in AIPOCH, K-Dense and Synthetic
collections. All 776 records and their scores remain in `full-inclusion.json`:
34 have `publication_status: temporarily-withheld`; the other 742 have
`publication_status: requires-review`, not an approval or installability claim.

These are conservative release holds based on the supplied issue list, not newly
established legal conclusions. Each record includes the reason and conditions for
resuming review. Shared-resource packages are not labelled corrupt. No Skill
payload, license declaration or original report is rewritten to remove a blocker.

Production fetch/build/validation/signing entry points reject held source
repository/directory pairs. New versions or commits do not automatically clear a
hold. A follow-up reviewed change must resolve the evidence/dependency issue and
remove the hold deliberately. The seven original-source holds resolved by PR #38 have been removed; all 452
current production releases are outside the remaining holds,
so this change does not remove existing installed packages or historical releases.

### Currently bound display subset

`registry.json` records 430 reports from `open-science-skills-20260911.zip`:
394 AIPOCH, 11 K-Dense-AI and 25 NVIDIA-BioNeMo. Every match uses repository,
repository-relative directory and the report's exact `meta.skill_name`, never a
global name-only lookup. `get-available-resources` and `scientific-brainstorming`
are explicitly excluded from this batch.
They are not among the 776 supplied Skill directories. The 430 records are
exact-version display bindings for the previously inspected 432-entry production
catalog, **not** the full submission count. An updated production source or package
digest intentionally stops matching an old binding until its mapping is reviewed.

Reports are preserved byte-for-byte under their SHA-256 names. They are evidence,
not executable tooling. Their test narratives (including simulations) are not
proof that the Marketplace operator reran these tests during import. Scores are
copied, not recalculated. Source archive digest and archive report path identify
the supplied material. Binding a record to a Marketplace source commit/version and
content digest identifies **where to display** it, not proof that the submitted
archive is byte-identical to that install package. Clients must disclose
`scope: submitted-material` and that installed-package equivalence is unverified.

To reproduce directly from the supplied archive:

```sh
node scripts/import-aipoch-audits.mjs --catalog /path/to/verified/marketplace.json \
  --archive /path/to/open-science-skills-20260911.zip \
  --output /path/to/new/audits
```

Both importers read Skill and report bytes directly from the ZIP. The complete
importer additionally requires its digest to match the reviewed selection input.
No independently extracted directory is accepted as report provenance. Archive
reads are bounded to 512 MiB compressed, 128 MiB selected uncompressed data,
4 MiB per selected file and 10,000 selected paths; duplicate paths are rejected.
The importer refuses missing, ambiguous, invalid or mismatched reports and will
not overwrite existing evidence. A maintainer must review future inputs before
publication. An upstream revision/path/content change requires a new reviewed
binding; it must not silently inherit a same-name score.

## Supplemental wire protocol

The existing v1 root, descriptors, package bytes, signatures and install receipts
are unchanged. New clients optionally fetch `v1/audits/catalog.json` from the
official CDN. Old clients ignore it. The JSON envelope contains only `payload_base64` and
`signature`. Decode canonical base64 to the exact signed UTF-8 bytes and verify
them against the client's independent production pin **before** parsing the
payload or mapping any field names. Never reserialize parsed JSON to verify it.
The existing Ed25519 signature envelope is reused. The new protocol discriminator is `openscience-aipoch-audits`,
schema version 1. Never accept the envelope's key as a trust anchor.

The decoded payload is a strict JSON catalog containing `schema_version`,
`protocol`, `catalog_revision`, `source_archive_sha256` and `entries`. Repository
registry fields are decoded into camelCase internally and explicitly encoded
as snake_case on the wire; unknown or mixed-format fields are rejected.
Each entry carries the registry identity and an `evaluation`: kind `aipoch-audit`,
auditor `AIPOCH`, scope `submitted-material`, numeric score/max_score, date,
evaluator_version, optional static_score and dynamic_score. Report URLs are
constructed only as `v1/audits/reports/<report_sha256>.json`; no supplied URL is
trusted. Duplicate identities, nonmatching revision/source/version/content, bad
signatures, unknown fields and out-of-range scores must be rejected by clients.

The protected, manually authorized publication workflow verifies the previous
audit envelope using the independent pin and reuses its immutable report digests.
Only reports absent from that authenticated history are conditionally uploaded;
unchanged reports incur no per-report PUT, HEAD or GET. Missing history triggers
initial publication; invalid history fails closed before any audit write. New
reports retain immutable conflict checks, including retries after partial failure.
The workflow then atomically writes the new signed envelope and invalidates that
CDN path. Audit counts distinguish uploaded and reused reports in the run log.
The supplement is CDN-only in this iteration: unavailable/invalid supplemental
metadata must not prevent normal catalog browsing or installation. Previously
verified evidence can be retained in memory for the same exact catalog revision.
No database migration or automatic install behavior changes are required.

If supplemental publication fails after the main catalog is published, the old
supplement will not match a new revision; clients display legacy metadata until
the protected publication is retried. A merged PR does not authorize deployment.

This supplemental protocol is not yet deployed. The earlier nested `catalog`
envelope and `--material` import option were unshipped development drafts; they
are rejected rather than supported as a second format. Existing install catalog
bytes and history require no migration. Clients consuming the supplement must
adopt the exact-byte envelope and strict shape validation before deployment.
