# Contributing to the OpenScience Skill Marketplace

## Repository workflow

Project members contribute directly to this repository; a fork is not required.
Create each change branch from the current default branch, `main`.

Use `<type>/<lowercase-hyphenated-description>` branch names, such as
`feat/skill-marketplace-bootstrap` or `fix/catalog-validation`.
Use an appropriate type other than `docs` for branch names.

Create all linked worktrees under this repository's `.worktree/` directory:

```bash
git fetch origin main
git worktree add .worktree/skill-marketplace-bootstrap \
  -b feat/skill-marketplace-bootstrap origin/main
```

Keep local plans under `docs/internal/`. Do not commit local plans, source
archives, generated output, dependencies, signing keys, or credentials.

## Commits and pull requests

Commit subjects and pull request titles use Conventional Commits with a scope:

```text
<type>(<scope>): <description>
```

Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, and `revert`. Scopes start with a lowercase letter and
use hyphens between words. Technical names such as `macOS` may retain their
capitalization. Descriptions are concise, imperative, and start lowercase.

```text
chore(repository): initialize marketplace repository
feat(protocol): add skill release schemas
```

For a breaking change, add `!` before the colon and a `BREAKING CHANGE:` footer.

Describe the problem, resulting behavior, relevant validation, and remaining
risks in each pull request. Explicitly identify historical compatibility,
new enums or states, and persistence changes. Include screenshots when a page
or interaction changes.

Substantial work requires a local implementation plan and maintainer review
before implementation. Obtain explicit approval to proceed to a pull request.

## Validation

Run relevant module tests and checks after the final material edit, and record
the commands and results in the pull request. A complete local test run is not
required; follow the pull request's CI results for full validation.

Use Node.js 22 and install dependencies with `npm ci --ignore-scripts`. Run
`npm run format:check`, `npm run validate`, and the relevant files under
`test/*.test.mjs` with `node --test`. Source changes also require
`npm run audit:sources -- --source /path/to/upstream --check`; publication changes
require `npm run publish:dry-run`. PR CI runs the complete tooling suite on Linux,
macOS and Windows. Do not execute scripts or tests bundled inside imported Skills
as part of catalog ingestion. Payload fixtures are excluded from tooling tests.

For a focused Windows source-checkout/audit rehearsal, dispatch `validate.yml`
with `full=false` (the default). It reuses the same checkout and audit steps,
reads the fixed Git snapshot and skips unrelated tooling tests. Dispatch with
`full=true` for the full three-platform validation. Both modes are read-only.
The upstream checkout uses command-scoped `core.longpaths=true`, following
[Git for Windows guidance](https://gitforwindows.org/git-cannot-create-a-file-or-directory-with-a-long-path.html),
without changing runner-wide Git configuration.

The protocol, source-readiness and publication responsibilities are documented in
[the protocol](protocol/README.md) and [publication guide](docs/publication.md).

## Content and publication

Repository-owned JSON data uses `snake_case` field names. JavaScript APIs use
`camelCase`; decode and encode configuration, manifests, audits, review records
and build context through `scripts/lib/metadata-json.mjs` at the file boundary.
Former camelCase JSON fields are rejected with no compatibility aliases. Keep
standard `package.json`/JSON Schema keywords, upstream payloads and authenticated
protocol bytes in their own formats. File names are unchanged.

Skill providers use the [authoring guide](authoring/README.md) and
`release.config.json` to reference a fixed Git commit. Do not edit the historical
584-member manifest to submit a new Skill. Provider intake produces review input
and unsigned local builds; it does not enroll submissions in production.

Keep authorship, publisher identity, upstream repository and exact commit/path,
package version, and license evidence separate. Do not infer reviewed release
metadata from demonstration fixtures or apply a repository license to all
third-party content without reviewing its evidence.

The initial catalog implementation, protocol, and publication configuration are still
under review. Production releases, signing-key configuration, and CDN writes
require separate explicit maintainer authorization. A merged pull request does
not itself authorize publication.

## License

Tooling contributions use [Apache-2.0](LICENSE). Preserve the separate licenses
and required notices of upstream Skill content and fixtures.
