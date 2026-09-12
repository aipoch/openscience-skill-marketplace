export function makeCandidate(id = "example") {
  return {
    skill: {
      id,
      version: "1.0.0",
      display_name: id,
      summary: "Test-only fixture",
      category: "other",
      inclusion_tier: "catalog-candidate",
      publisher: {
        id: "fixture",
        name: "Test fixture",
        url: "https://example.com",
      },
      source: {
        repository: "https://github.com/test/source",
        commit: "a".repeat(40),
        path: `skills/${id}`,
      },
      license: {
        expression: "MIT",
        evidence: [
          {
            url: `https://github.com/test/source/blob/${"a".repeat(40)}/LICENSE`,
            sha256: "b".repeat(64),
          },
        ],
        review: { reviewed_by: "Test-only fixture", reviewed_on: "2026-09-12" },
      },
    },
    files: [
      {
        path: "SKILL.md",
        bytes: Buffer.from(
          `---\nname: ${id}\ndescription: Test-only fixture\nlicense: MIT\n---\nTest-only fixture\n`,
        ),
        mode: "100644",
      },
    ],
  };
}
