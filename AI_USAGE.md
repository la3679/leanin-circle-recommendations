# AI assistance

Codex assisted with reading the assignment, comparing approaches, implementing the API and schema, writing tests and documentation, and running local verification. The user selected a transparent hybrid approach using TypeScript, Express, and SQLite after discussing alternatives.

The API uses deterministic local scoring and explanation templates. It does not call an AI model at request time. Supplied data and generator remain unchanged. The original README is preserved in `docs/DATASET.md`.

## Verification and corrections

- Initial integration tests exposed repeated tags in the fixture. Import now treats tags as sets, leaving source JSON untouched.
- Tests distinguish unlisted discovery rules from inactivity, since a planted Circle satisfies both exclusion conditions.
- A score-change test was isolated from list diversity so it measures the activity effect directly.
- The snapshot date is explicit and injectable; tests do not depend on today's date.
- Scenario IDs occur in demonstrations and tests, not recommendation rules.

## Decisions to understand before submitting

The candidate should review the code and be prepared to explain eligibility, explicit versus inferred interests, heuristic weights, diversity, the fixed clock, schema constraints, and production limitations. Tests establish specified behavior; they do not prove real-world recommendation quality. The one-page design records the main tradeoffs and future work.
