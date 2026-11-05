# Interview walkthrough

This guide explains the implemented decisions. Read the linked files and run the demo before presenting the work; do not claim product improvements that this synthetic dataset cannot establish. AI assistance is documented in [AI_USAGE.md](../AI_USAGE.md).

## Explain the solution in a minute

The API helps a member discover relevant, active Circles they can actually join. It first removes unsuitable candidates, then combines stated topic interests, weaker evidence from existing memberships, and Circle activity. It diversifies the result so similar Circles do not dominate, and generates explanations from the evidence used in ranking. Members with no history still receive useful discoveries. The implementation uses TypeScript, Express, SQLite, and deterministic rules so the behavior is straightforward to test and explain.

## Follow a request through the code

1. [server.ts](../src/server.ts) loads the imported SQLite snapshot and creates the recommendation engine. The fixture date is explicit rather than taken from the current calendar date.
2. [app.ts](../src/app.ts) validates the user ID, limit, and debug parameter, then calls the engine. Invalid input returns 400; an unknown user returns 404.
3. [recommendations.ts](../src/recommendations.ts) excludes existing memberships, unlisted/full Circles, and stale or future activity before scoring.
4. The engine gives primary-topic matches more weight than incidental tags. Membership topics are weaker inferred interests. Activity uses recency and capped volumes so noisy groups do not win solely through volume.
5. Greedy reranking discounts a repeated topic and allows at most two results per primary topic. Missing topics are not incorrectly grouped together.
6. Explanation templates describe the matched interest or inferred topic, recent activity, and whether joining requires a request. The optional debug output makes the score components reviewable.

## Demonstrate the four scenarios

Run `npm run demo`, then show HTTP output with `debug=true` if asked how a result was scored.

| User | What to show | Why it matters |
| --- | --- | --- |
| 42 | Diverse, active discoveries without invented preferences | Cold start and incomplete profiles are supported |
| 7 | #6 and #5 in the top five | Explicit interests meaningfully shape rankings |
| 15 | Negotiation and confidence both represented, without all three negotiation Circles | List quality includes diversity |
| 23 | #22 first; #20 and #21 absent | Availability and health override attractive topic matches |

## Questions to be ready for

**Why this approach rather than machine learning?** The supplied topics are usable directly, descriptions are repetitive, and there are no recommendation-outcome labels. Transparent heuristics are proportionate to the exercise. Learned ranking would require logged impressions, engagement/join outcomes, and a reliable evaluation process.

**How were the weights chosen?** They express an initial policy: explicit interests dominate, inferred interests are weaker, and health breaks ties and supports discovery. They are not optimized or proven. Production experiments would evaluate relevance and successful participation while monitoring coverage and retention.

**Why SQLite if the API loads data into memory?** SQLite demonstrates normalized persistence, constraints, relationships, and transactional seeding without setup friction. Loading a small, read-only snapshot once keeps request logic simple and independently testable. Production would use indexed candidate retrieval and refreshed features instead of a whole-catalog startup snapshot.

**What is the most subtle data issue?** The fixture is anchored to September 21, 2026. Using the actual date would age otherwise healthy Circles as the assignment is reviewed later. The response exposes its effective date. Changing that date does not refresh the supplied aggregate counts.

**How do you know the filtering works?** There are separate tests for visibility and inactivity. This matters because planted Circle #21 is both unlisted and inactive, so excluding it alone cannot prove both rules are implemented. Other tests change capacity, interests, memberships, and activity instead of only asserting fixed scenario outputs.

**How do you avoid misleading explanations?** Templates use actual score evidence, distinguish inferred interests from stated ones, and say "request to join" where required. The API does not claim proximity, scheduling suitability, or guaranteed admission.

**What are the main limitations?** Topic caps are not semantic deduplication; tags can be noisy; activity-based discovery can disadvantage new/small groups; no location/schedule data exists; and an in-memory snapshot becomes stale. Tests establish intended behavior, not real-world recommendation quality.

**What changes first for production?** Authentication and member-specific visibility, live candidate queries, refreshed activity features, capacity rechecks during joining, invalidation of cached recommendations, operational monitoring, and outcome-based evaluation. Add exploration for new/small groups rather than permanently rewarding already active ones.

## Verify before sharing

Run `npm run check` and review the CI result. Ensure reviewers can access the repository. The one-page design is [technical-design.pdf](../output/pdf/technical-design.pdf); schema rationale is in [SCHEMA.md](SCHEMA.md). Be ready to explain and modify the implementation rather than memorizing this guide.
