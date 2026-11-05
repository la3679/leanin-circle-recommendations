# Lean In Circle recommendations

A locally runnable API that recommends relevant, active Circles with space available and explains each recommendation. It uses the supplied synthetic dataset: 100 members, 40 Circles, 441 memberships, 22 topics, and 386 posts. No API keys, external services, or paid accounts are needed.

## Run locally

Install **Node.js 22.13 or newer**, then run these commands from this directory:

```sh
npm ci
npm run seed
npm run build
npm start
```

The API listens at `http://127.0.0.1:3000`. Open this URL in a browser:

```text
http://127.0.0.1:3000/users/7/recommendations
```

Or, in a second PowerShell terminal:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/users/7/recommendations?limit=5' |
  ConvertTo-Json -Depth 8
```

On macOS/Linux:

```sh
curl 'http://127.0.0.1:3000/users/7/recommendations?limit=5'
```

For development, use `npm run dev` after seeding. `npm run demo` prints all four assignment scenarios without starting a server or touching the file database. `npm run check` runs strict TypeScript checking, the test suite, and the build.

SQLite uses Node's built-in `node:sqlite` module, so no database server or native npm compilation is required. Node 22 emits an experimental SQLite warning; the tested commands still complete successfully. Run commands from the project root because seed and schema paths are relative to it.

## API

### `GET /users/:userId/recommendations`

| Input | Behavior |
| --- | --- |
| `userId` | Positive safe integer; unknown IDs return `404` |
| `limit` | Optional integer from 1 to 20; default 5 |
| `debug` | Optional `true` or `false`; default `false` |

Malformed IDs, invalid/repeated query parameters, and unsupported parameters return `400`. Responses and errors are JSON. `GET /health` returns status and the effective snapshot date. There is no authentication in this local read-only exercise; production would derive identity from an authenticated session.

For `GET /users/23/recommendations?limit=1`, the response has this shape (score rounded here for readability):

```json
{
  "user_id": 23,
  "as_of": "2026-09-21T00:00:00.000Z",
  "strategy": "personalized",
  "requested_limit": 1,
  "returned": 1,
  "recommendations": [
    {
      "circle_id": 22,
      "name": "Level Up Collective",
      "topic": "getting-promoted",
      "format": "hybrid",
      "join_policy": "request",
      "available_spots": 6,
      "score": 0.878,
      "explanation": "Matches your interest in getting promoted, with activity in the past month. Space is available; you can request to join."
    }
  ]
}
```

`available_spots: null` means unlimited capacity. Scores are relative ranking signals, **not probabilities**. Fewer results are returned when eligibility or diversity rules exhaust the candidates; an empty list is a successful `200` response. Unknown users return `{"error":{"code":"USER_NOT_FOUND","message":"User not found."}}`.

Add `debug=true` to inspect normalized score components, strategy weights, base score, diversity multiplier, matched interests, inferred topic, and activity age. Debug details are intended for local review and should be restricted in production.

## Recommendation decisions

1. **Eligibility:** exclude joined, unlisted, full/over-capacity Circles and those whose last activity is more than 90 days old or in the future. Uncapped Circles remain eligible. Request-to-join Circles remain eligible with accurate wording.
2. **Explicit relevance:** use the primary topic and tags separately. Let coverage be matched interests divided by stated interests. A primary-topic match scores `0.85 + 0.15 * coverage`; tag-only matches score `0.35 * coverage`. Duplicate tags count once.
3. **Inferred relevance:** for a candidate's primary topic, use the fraction of the user's topic-bearing memberships with that topic. This is weaker evidence than stated preferences. No inference from names, photos, ethnicity, or profile completeness is used.
4. **Health:** `0.45 * exp(-activityAgeDays/30) + 0.25 * posts + 0.20 * chat + 0.10 * engagement`. Volume terms use `log(1 + min(value, cap)) / log(1 + cap)`, capped at 20 posts, 220 chat messages, and 30 mean engagements per post. Engagement is reactions + comments + saves per post in the snapshot's trailing 30-day window; no posts means zero engagement. Saturation limits volume dominance.
5. **Base score:** with stated interests, weights are 70% explicit, 10% inferred, 20% health. With only topic-bearing memberships, weights are 65% inferred and 35% health. With neither, rank by health. Missing signals contribute zero; weights are not redistributed in the personalized strategy.
6. **Diversity:** greedily select the highest score, multiply scores for a repeated primary topic by 0.75, and cap each primary topic at two results. Null-topic Circles are handled independently. Equal scores use ascending Circle ID. The returned score includes the diversity multiplier.
7. **Explanation:** use the actual matched interest, inferred membership topic, or discovery fallback, followed by evidence-based activity and join-policy wording.

Weights and cutoffs are explicit, testable heuristics, not trained or experimentally validated parameters. Diversity balances alternatives on a strong topic against breadth; it is not full semantic deduplication. A tag match can surface a Circle outside its main topic, which is why tags receive less weight.

## Assignment scenarios

Run `npm run demo` or request these user IDs:

| User | Expected behavior verified by tests |
| --- | --- |
| 42 | Five healthy discoveries with varied topics, without invented interests |
| 7 | Both #5 Women Who Lead and #6 Speak Up Circle appear in the top five |
| 15 | At least one, at most two of negotiation Circles #10/#11/#12; confidence also represented |
| 23 | #22 Level Up Collective ranks first; full #20 and inactive #21 are excluded |

The engine contains no scenario-specific user or Circle IDs. Tests additionally cover all 100 users, independent inactivity/visibility checks, capacity changes, changed interests/memberships/activity, missing profiles/topics, deterministic order, empty catalogs, invalid HTTP input, idempotent imports, and rollback on invalid relationships. Tests use in-memory databases and never reset the local file database.

## Snapshot clock and configuration

The generator is anchored to **2026-09-21T00:00:00.000Z**. The importer persists that date, and ranking defaults to it. Using the machine's current date would make this frozen fixture progressively stale. Each response includes the effective date.

| Environment variable | Default |
| --- | --- |
| `PORT` | `3000` |
| `HOST` | `127.0.0.1` |
| `DATABASE_PATH` | `./var/circles.sqlite` |
| `AS_OF` | Imported snapshot date |

Set variables in your shell; `.env.example` is documentation, not automatically loaded. `AS_OF` must be a UTC ISO timestamp, e.g. `2026-09-21T00:00:00.000Z`. It changes recency calculations and the post-engagement window; it **does not recompute supplied 30-day aggregate counts**. Production needs refreshed aggregates and a live clock.

`npm run seed` atomically replaces the local database contents with the fixture and can be rerun. The running server loads one snapshot at startup, so restart it after reseeding. To regenerate the original JSON, run `node generate.mjs`, then seed again. Generation is optional; the supplied files are already included.

## Structure and design

```text
src/app.ts                 HTTP contract and error handling
src/recommendations.ts     Eligibility, ranking, diversity, explanations
src/database.ts           Validated JSON import and SQLite snapshot loading
src/models.ts             Runtime schemas and inferred TypeScript types
src/server.ts              Startup and shutdown
src/seed-cli.ts            Database import command
src/demo.ts                Four-scenario walkthrough
db/schema.sql             Tables, constraints, indexes
test/                     HTTP, recommendation, and database tests
docs/DATASET.md            Original dataset README
docs/SCHEMA.md             Relationships and indexing rationale
docs/DESIGN.md             Concise technical design source
output/pdf/technical-design.pdf  One-page technical design
AI_USAGE.md               AI assistance and review points
```

The [one-page technical design](output/pdf/technical-design.pdf) and [schema rationale](docs/SCHEMA.md) cover the submission's design deliverables.

The API reads a validated SQLite snapshot into memory once. This avoids a database call per candidate and keeps ranking independently testable. SQLite demonstrates relational persistence and constraints without a separate service. Synchronous loading is confined to CLI/startup; request ranking scans 40 Circles and greedily selects at most 20.

## Deliberate scope and limitations

- No frontend, authentication, joins/writes, hosted deployment, or external AI calls.
- No recommendation-outcome labels exist, so tests demonstrate behavior and invariants, not real-world relevance accuracy or promotion impact.
- The canonical topic is stronger than noisy generated tags; repeated generic descriptions do not justify embeddings here.
- No Circle location or meeting schedule exists, so the API cannot claim geographic or scheduling suitability. Format is returned for the caller to display.
- Last-activity and aggregate columns are authoritative snapshot health signals. Generated post timestamps are not guaranteed to agree with every aggregate, so posts contribute engagement rather than replacing those signals.
- `member_count` is a validated cached count. Production must update counts transactionally and recheck capacity at join time.
- Production requires indexed candidate retrieval, refreshed features, authenticated discovery rules, and monitoring. See the one-page design and `docs/SCHEMA.md` for rationale.
