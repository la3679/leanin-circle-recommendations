# AI usage and contributions

I used OpenAI Codex as a development assistant for this take-home assignment. My role was to direct the work, consider the proposed approaches, select the implementation direction, and review the documentation. Codex generated the implementation, tests, and initial documentation and executed the technical checks described below.

## My contributions

- Set the direction for the submission and requested a step-by-step analysis of the assignment before implementation.
- Asked for alternative recommendation methods and their tradeoffs before selecting the proposed transparent hybrid approach with TypeScript, Express, and SQLite.
- Reviewed and verified all project documentation, including the setup instructions, technical design, schema rationale, and AI usage disclosure.
- Requested revisions to this disclosure so it clearly distinguishes my contributions from the work performed by Codex.
- Retain responsibility for reviewing and approving the final submission.

## Codex contributions

- Inspected the assignment, supplied files, and dataset relationships; proposed implementation options and tradeoffs.
- Implemented the API, database schema and importer, recommendation scoring, diversity rules, cold-start behavior, and explanation templates.
- Wrote the automated tests, setup instructions, technical design, and schema documentation.
- Ran local type checking, tests, builds, clean-install verification, and HTTP checks; configured and checked GitHub CI on Windows and Linux.
- Created and published the GitHub repository under my direction.

## Verification and limitations

Codex's automated checks exposed repeated tags in the supplied fixture; the importer now treats tags as sets without modifying the source JSON. Tests check visibility and inactivity independently, exercise changed interests and capacity, and cover all 100 users and the four assignment scenarios. The fixture date is explicit so results do not depend on the current calendar date.

My documentation review is separate from the automated technical verification performed by Codex. These checks establish intended behavior, not real-world recommendation quality. Scoring weights remain documented heuristics.

AI was used during development. The running API uses deterministic scoring and explanation templates and makes no AI model calls. The supplied dataset and generator remain unchanged; the original dataset README is preserved in `docs/DATASET.md`.
