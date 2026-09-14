# Open-Science Skill Marketplace

An independent protocol and publication toolchain for individually distributed
Open-Science Skills. The authoritative manifest contains **584 Skills**, resolved
against a fixed upstream Git commit. [The release plan](skills/release_plan.json)
selects **394 reviewed Skills**, retaining all 392 previous members and adding
`hypothesis-generation` and `research-grants` at `1.0.0` with their required MIT notices.
It explicitly defers the other 190 members. See [release selection](skills/README.md#release-selection).

Every selected package has a byte-bound redistribution review. Deferred members
require separate review before inclusion. See [GitHub Releases](https://github.com/aipoch/openscience-skill-marketplace/releases)
and [publication runs](https://github.com/aipoch/openscience-skill-marketplace/actions/workflows/publish.yml)
for production status; a successful local build is not publication.

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

The complete audit reads Git objects at the default snapshot
`d92441066ea6259967469be8e0c8c7b6587928ab`. Builds also read selected per-Skill
commits; fetch missing objects with
`node scripts/fetch-selected-sources.mjs --source /path/to/medical-research-skills`.
Neither command depends on the clone's checkout.
They do not execute Skill scripts. The build creates an unsigned selected-Skill
catalog in `dist/candidate`, including the original MIT notice in the package.
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

## Registered external sources

The production catalog now selects 394 original members plus two independently
reviewed K-Dense Skills: `scientific-brainstorming` and `get-available-resources`.
Their exact provider configurations live in [authoring/production.json](authoring/production.json).
The original 584-member manifest and its 190 deferrals remain unchanged. See
[provider publication](authoring/README.md#production-and-batch-publication) for
source fetching, review requirements and incremental CDN publication.
