# Test-only integration fixtures

These fixtures preserve real package bytes and provenance from
`aipoch/medical-research-skills@d92441066ea6259967469be8e0c8c7b6587928ab`:

- `primary-plan-recommender`: original 89/100 final score, 91 static, 88.4 dynamic;
  no established assessed Skill version.
- `pdf-to-ppt-pack`: no evaluation object.

`source/` contains the corresponding immutable upstream files and the upstream
MIT notice. `snapshot/` contains deterministic listing, release-index, details,
and shards. `provenance.json` identifies their origin. Regenerate with
`node scripts/generate-fixtures.mjs --source /path/to/medical-research-skills`.

**These are not approved production releases.** Descriptor license-review fields
explicitly say TEST FIXTURE ONLY; production redistribution reviews remain pending.
The publisher URL and initial package version reflect the maintainer's configuration,
not a claim that these versions have already been published.

Fixtures have two members rather than the required 584. The production entrypoint
rejects them; the production builder uses the manifest and reviewed source inputs,
not this fixture directory. Tests never execute their scripts. Signing tests and
dry-runs generate ephemeral keys; no private key is committed. There is no published
immutable test URL yet.

The category alignment rebuilds this unpublished development snapshot with the
App's literal category values. Its root, index and descriptor hashes change; Skill
payloads and shard bytes do not. When updating a development contract, move the old
local `snapshot/` aside and generate into a fresh directory. Do not feed obsolete
fixtures into the history path or overwrite an actual published immutable release.

`test/app-contract.test.mjs` projects both real listings and their release details.
Explicitly synthetic builder cases cover all five App categories, missing authors,
optional assessments and independent version fields without changing these real
sources or claiming additional redistribution approvals.
