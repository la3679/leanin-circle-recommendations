# Circle recommendation API technical design

## Goal and implementation

Help members find relevant peer groups with room to participate and understandable reasons to join. A TypeScript/Express endpoint returns ranked Circles and short explanations. SQLite persists a normalized, validated import of the supplied JSON. The read-only server loads the small snapshot once; ranking and HTTP handling remain separate. No external services are required.

## Eligibility and ranking

Exclude existing memberships, unlisted Circles, full or over-capacity Circles, and activity older than 90 days or in the future. Null capacity is unlimited. Request-to-join Circles remain discoverable with accurate explanations. These visibility and inactivity policies are explicit assumptions, not supplied product rules.

Explicit topic relevance dominates: a primary-topic match scores 0.85 plus up to 0.15 for interest coverage; tag-only matches receive at most 0.35. Inferred relevance is the fraction of topic-bearing memberships matching a candidate's primary topic. Health combines recency (45%), capped logarithmic post volume (25%), chat volume (20%), and mean recent post engagement (10%). Personalized scores weight explicit relevance 70%, inferred relevance 10%, and health 20%. Members without stated interests use membership relevance and health (65/35); members without either signal use health alone.

Greedy selection discounts a repeated primary topic by 25% and caps it at two results; missing topics do not share one bucket. Ties use Circle ID. Explanations use the same interest, membership, activity, and availability evidence as ranking. Scores are ranking signals, not probabilities. Weights are documented heuristics requiring product validation.

## Data and tradeoffs

Topics, users, interests, Circles, tags, memberships, posts, and snapshot metadata form the schema. Foreign keys enforce relationships, including member-authored posts; composite membership keys prevent duplicates. Reverse-membership and Circle/time activity indexes support joins and aggregation. Imports deduplicate repeated tags, validate cached member counts, and roll back on failure.

The fixture clock is September 21, 2026, matching generation; using wall time would age a frozen dataset incorrectly. Clock injection enables deterministic tests. Aggregate health columns are authoritative; raw posts supply engagement. Changing the clock alone does not refresh aggregates. No profile-completeness penalty or identity inference is used. Missing Circle locations prevent geographic claims. Topic caps cannot detect every semantic duplicate. SQLite and startup loading simplify review but require a restart after import; CPU ranking is O(C times K) for C Circles and K selected results.

## Validation and production path

Tests cover the four planted scenarios, all 100 users through HTTP and ranking invariants, isolated visibility/inactivity checks, changed preferences/capacity/activity, cold start, missing data, deterministic order, malformed requests, and transactional imports. Behavioral tests cannot measure real relevance without outcome labels.

For production, authenticate the member, retrieve indexed eligible candidates, refresh features incrementally, cache with membership/capacity invalidation, and recheck capacity during joining. Add bounded request rates, observability, and an authenticated debug path. Log consent-aware impressions and joins; evaluate relevance, topic/catalog coverage, successful participation, and retention with guardrails before tuning weights or considering learned ranking. Preserve exploration for new/small Circles so existing activity does not permanently determine exposure.
