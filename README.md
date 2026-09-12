# OpenScience Skill Marketplace

An independent protocol and publication toolchain for individually distributed
OpenScience Skills. The authoritative manifest contains **584 Skills**, resolved
against a fixed upstream Git commit. [The release plan](skills/release_plan.json)
selects 572 candidates and explicitly defers 12 problematic members.

**No production catalog has been published.** The selected candidates still need
redistribution reviews before publication. This repository includes real source metadata and
clearly marked integration fixtures, not approval to distribute every package.

## Develop

Use Node.js 22 and npm:

```bash
npm ci --ignore-scripts
npm run validate
node --test test/catalog.test.mjs
npm run publish:dry-run
```

The dry-run signs test data with an ephemeral test key and uses temporary local
GitHub/CDN stores. It performs no external publication and leaves no signing key.

To reproduce the complete source audit from a local clone of
[aipoch/medical-research-skills](https://github.com/aipoch/medical-research-skills):

```bash
npm run audit:sources -- --source /path/to/medical-research-skills --check
npm run build:catalog -- --source /path/to/medical-research-skills
```

Both commands read Git objects at
`d92441066ea6259967469be8e0c8c7b6587928ab`, regardless of the clone's checkout.
They do not execute Skill scripts. The build currently exits unsuccessfully and
writes `dist/candidate/publication-blockers.json` for the 572 pending reviews.
Only the explicitly selected batch is built; a failure in any selected member
stops the batch. The complete authority and source audit remain unchanged.

## Repository map

- [Provider authoring guide](authoring/README.md): `release.config.json`, fixed Git source intake and reviewed local builds.
- [skills/](skills/README.md): exact membership, source mapping, audit and review policy.
- [protocol/](protocol/README.md): independent Skill Protocol v1 draft and App mapping.
- [protocol/fixtures/](protocol/fixtures/README.md): scored and unscored real-source examples.
- [Publication guide](docs/publication.md): batch workflow, trust, history and recovery.
- [CONTRIBUTING.md](CONTRIBUTING.md): branches, worktrees, commits, PRs and validation.

Tooling is licensed under [Apache-2.0](LICENSE). The small upstream fixture copies
retain their own [MIT license](protocol/fixtures/source/LICENSE). Source package
licenses and third-party data rights require separate review; the tooling license
does not relicense them.
