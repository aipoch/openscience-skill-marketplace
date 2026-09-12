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
