# Batch publication and recovery

The current release selects 121 reviewed Skills: the 21 previously published
members plus 100 additional members at `1.0.0`. It explicitly defers 463 other
members. Byte-bound redistribution reviews are recorded in
`skills/reviews.json`; the seventeen assessment-omission records remain separate
and are not license approvals. Production publication uses the protected main
workflow after explicit maintainer authorization. Check the
[workflow runs](https://github.com/aipoch/openscience-skill-marketplace/actions/workflows/publish.yml)
and [releases](https://github.com/aipoch/openscience-skill-marketplace/releases)
for the actual publication outcome.

## Responsibilities

- `main`: reviewed inputs, protocol, tooling, source observations and review records.
- `published`: signed discovery, immutable snapshot metadata, release indexes and details.
- GitHub Releases: one `catalog-<revision>` release per complete snapshot, containing
  all required immutable objects. There is no per-Skill release operation.
- CDN/S3: byte-identical immutable logical objects and the stable discovery pair.
- Workflow temporary directories: build/download state only, never authoritative recovery data.

Unchanged versions reuse their exact descriptors and shard associations. The signed
release index retains older versions even when the current listing changes. The
first implementation includes all retained referenced objects in each catalog's
GitHub Release so each snapshot is self-contained; unchanged CDN objects and retries
reuse existing bytes. This duplicates unchanged GitHub assets across different
snapshots. The tool currently caps a snapshot at 1,000 assets; introduce an explicit
cross-snapshot transport index before growing beyond this limit, rather than losing
historical objects. The complete snapshot fails if the limit is exceeded.

## Workflow

`publish.yml` is manually dispatched and defaults to rehearsal only. Its reusable
`publication-check.yml` runs the real publication/reconciliation code against local
stores, release-selection guards and transport-boundary tests, with no secrets
or external writes. A normal
PR also exercises that code through `npm test` and `npm run publish:dry-run`.

A production run requires `publish: true`, the current main commit, and the protected
`production` environment. Configure required reviewers and restrict that environment
to main before enabling it. Production code checks these explicit values:

| Configuration                                             | Location                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `SKILL_MARKETPLACE_PUBLISH_ENABLED=true`                  | protected variable                                                         |
| `SKILL_MARKETPLACE_PUBLIC_KEY` (SPKI DER base64)          | protected variable / independent App pin                                   |
| `SKILL_MARKETPLACE_KEY_FINGERPRINT` (SHA-256 of SPKI DER) | protected variable                                                         |
| `SKILL_MARKETPLACE_KEY_ID` (`openscience-skills-...`)     | protected variable                                                         |
| `SKILL_MARKETPLACE_PRIVATE_KEY` (PKCS#8 DER base64)       | protected secret                                                           |
| `SKILL_MARKETPLACE_CDN_BASE_URL`                          | protected secret, HTTPS origin only, for example `https://cdn.example.com` |
| `SKILL_MARKETPLACE_CDN_DISTRIBUTION_ID`                   | protected secret, CloudFront distribution serving the Skill prefix         |
| `SKILL_MARKETPLACE_BUCKET`                                | protected secret                                                           |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`              | protected secrets                                                          |
| `AWS_DEFAULT_REGION`                                      | protected variable                                                         |

As in Specialist, the signing key ID, expected public key and fingerprint are
Variables; the private key, bucket, CDN origin, distribution ID and AWS credentials
are Secrets. Skill additionally uses the existing publish-enabled and AWS region
Variables. Keep these settings in the `production` environment. The fixed route
prefix is owned by the code and is not another Actions setting.

Use least-privilege access restricted to the Skill Marketplace prefix. Keep these
keys and paths separate from Specialist publication. The Ubuntu runner needs `gh`
and AWS CLI with S3 `put-object --if-none-match` and CloudFront invalidation support.
The publication identity also needs `cloudfront:CreateInvalidation` and
`cloudfront:GetInvalidation` for the configured distribution. No infrastructure or
production credentials are created by repository validation.

Publishing and mirror verification append the fixed path
`/open-science/skill-marketplace/v1/` to the HTTPS origin. A trailing `/` on the
origin is accepted; paths, credentials, queries and fragments are rejected.
This follows Specialist's origin-plus-prefix configuration while keeping Skills
under their own prefix. No real origin or distribution is selected by the tools.
If the candidate origin `https://statics.aipoch.com` is approved later, discovery
would be `https://statics.aipoch.com/open-science/skill-marketplace/v1/marketplace.json`;
this is not a claimed live endpoint.

The production workflow:

1. Runs tooling checks; reads the fixed upstream Git commit and verifies audit equality.
2. Downloads and verifies the previous signed root and every object in its release index.
3. Validates the release plan against the complete 584-member authority, then builds
   every selected member after source, license-review and resource gates pass.
4. Requires current listings to match exactly the selected IDs, versions and source
   paths, then signs exact root bytes and verifies the configured key and fingerprint.
5. Creates/reuses one draft catalog release and uploads missing assets without clobbering.
6. Uses conditional S3 writes for immutable objects, reads public CDN and GitHub bytes,
   and verifies equality before moving either stable root.
7. Publishes the verified release, writes metadata through `.worktree/published`, then
   promotes the stable CDN signature/root pair, invalidates both CloudFront paths,
   waits for completion, then verifies both mirrors' roots and signatures.

S3 conditional immutable writes use the documented
[`If-None-Match: *` operation](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-object.html).
An existing unequal object is a hard conflict. Authorization or network errors are
not treated as a missing object. Do not use `gh release upload --clobber`.

The CDN must expose the object-store prefix with correct byte preservation and no
stale negative caching for newly created immutable objects. Stable metadata must
revalidate (`Cache-Control: no-cache`); immutable objects use long-lived caching.
The S3 transport calls AWS CLI
[`create-invalidation`](https://docs.aws.amazon.com/cli/latest/reference/cloudfront/create-invalidation.html)
with exactly `/open-science/skill-marketplace/v1/marketplace.json` and
`/open-science/skill-marketplace/v1/marketplace.json.sig` after both uploads. It
then calls
[`wait invalidation-completed`](https://docs.aws.amazon.com/cli/latest/reference/cloudfront/wait/invalidation-completed.html)
with the returned ID. The waiter polls every 20 seconds and fails after 30
unsuccessful checks. Creation, wait and final byte-verification failures fail
the publication run; a completed invalidation alone is not proof of mirror equality.
Immutable shards, descriptors, indexes and snapshots are never invalidated.
This does not configure a distribution, change its cache policy or solve negative
caching of newly uploaded objects; those remain deployment prerequisites.

## Recovery

Retry from the same reviewed inputs and pinned key. A snapshot identity and Ed25519
signature are deterministic. Every retry reads existing object bytes: matching
bytes are reused, and conflicting bytes stop publication. A partially uploaded
draft can receive its missing assets. If unchanged inputs produce the same snapshot
after main advances, retries preserve the original draft target commit and verify
each asset against the candidate bytes. A published release missing an expected
asset fails rather than modifying released content. Failed Git promotion cleans
up the temporary worktree and any local publication branch it created, allowing
the same checkout to retry. The published branch carries `* -text` Git attributes
to preserve signed metadata bytes even when the checkout enables automatic
line-ending conversion.

Both transports receive the immutable snapshot pair before stable promotion.
The stable root/signature pair is not atomic across objects or transports. Tests
interrupt every immutable write, stable-signature write and stable-root write,
then prove that retry restores matching final bytes. During a mismatch clients
must retain a verified snapshot or retry the bounded fetch. The publisher never
accepts mismatched bytes as a successful completed run.

A retry after root upload or CloudFront failure revalidates existing immutable
bytes, rewrites the same stable pair and requests a fresh invalidation for both
paths. AWS CLI generates the request's caller reference. No invalidation ID is
persisted locally or used as authoritative recovery state. Even an unchanged
successful rerun requests another refresh, so it consumes another invalidation
request; immutable content is still reused.

The signed `previous_revision` preserves the original parent across workflow restarts;
rebuilding identical already-published input returns its original root and parent.
The expected previous revision prevents overwriting a different published root.
Workflow concurrency serializes publications; an interrupted run must be reconciled
before authoring an unrelated next snapshot. If `published` has already advanced,
restore the candidate from its immutable signed snapshot rather than signing a
new interpretation of old bytes. All historical objects remain referenced through
the signed release index. Local recovery files cannot override remote evidence.

Run `verify-published.yml` only after a publication exists. It reads and authenticates
GitHub history and compares every referenced object plus the stable signed root
against the public CDN. It performs no remote writes.

## Scope and remaining decisions

The earlier full-path `SKILL_MARKETPLACE_CDN_BASE_URL` was unpublished development
configuration. Preflight on 2026-09-12 found no GitHub Releases, tags, `published`
branch, repository variables or environments. Replace any local full-path value
with its origin and supply the distribution ID before an explicitly authorized
deployment. Both publication and the read-only mirror verifier reject the old
full-path format; there is no dual-format compatibility reader. Public protocol
bytes, storage paths and historical immutable objects are unchanged.

There is no App database, settings, cache, installation-source document or migration
in this repository. Category and evidence-kind values are metadata only;
publication steps are not client installation states. No UI changes require screenshots.

The release plan explicitly defers four syntax errors, one missing description,
five missing license declarations, the PPI resource limits and the PPTX license
conflict, plus the CC BY-NC-ND 4.0 article bundled in `paper-tweet-generator`.
Another 450 members are outside the current batch while their reviews remain
pending, including six entries with documented package paths absent from the
pinned source and 29 entries with asset or attribution follow-ups. All 21
previously published Skills keep their original descriptors and shards. See [release selection](../skills/README.md#release-selection) for the
complete-partition rules and how to include corrected members later. The seventeen invalid assessments are explicitly
omitted; their original reports and audit findings remain intact. Fixes to upstream bytes and any PPI redesign need separate
approval. Production addresses and signed immutable releases must be verified
from the configured environment and successful publication output.

Local tests and the dry-run cover protocol, packaging, history, transport commands
and interruption recovery. The production workflow and subsequent
`verify-published.yml` run provide live GitHub Release/S3/CDN validation; local
simulation alone does not establish that a release is available.

## Initial CDN object checks

Publication checks each exact object key with authenticated S3 `HeadObject`
before requesting its public CDN bytes. Only an explicit S3 not-found response
means the object can be created; access-denied and other errors stop publication.
This avoids requesting missing CDN keys, which can return and cache HTTP 403
before the first upload. Existing objects must still be publicly retrievable
and byte-identical; S3 existence never substitutes for CDN verification.

The upload identity needs `s3:GetObject` and sufficient `s3:ListBucket` permission
to distinguish missing objects from access denial, alongside the existing write
and CloudFront invalidation permissions. See [AWS HeadObject behavior](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html).
