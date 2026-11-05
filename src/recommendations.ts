import { z } from 'zod';
import type { Circle, Snapshot } from './models.js';

const DAY = 86_400_000;
export const POLICY = {
  maxInactiveDays: 90,
  maxPerTopic: 2,
  repeatTopicMultiplier: 0.75,
  weights: {
    personalized: { explicit: 0.7, inferred: 0.1, health: 0.2 },
    membership: { explicit: 0, inferred: 0.65, health: 0.35 },
    discovery: { explicit: 0, inferred: 0, health: 1 },
  },
} as const;

type Strategy = keyof typeof POLICY.weights;
interface Components {
  explicit: number;
  inferred: number;
  health: number;
}
interface Candidate {
  circle: Circle;
  components: Components;
  baseScore: number;
  explicitTopics: string[];
  inferredTopic: string | null;
  daysSinceActivity: number;
}
export interface Recommendation {
  circle_id: number;
  name: string;
  topic: string | null;
  format: Circle['format'];
  join_policy: Circle['join_policy'];
  available_spots: number | null;
  score: number;
  explanation: string;
  debug?: {
    components: Components;
    weights: typeof POLICY.weights[Strategy];
    base_score: number;
    diversity_multiplier: number;
    matched_interests: string[];
    inferred_topic: string | null;
    days_since_activity: number;
  };
}
export interface RecommendationResponse {
  user_id: number;
  as_of: string;
  strategy: Strategy;
  requested_limit: number;
  returned: number;
  recommendations: Recommendation[];
}

const rounded = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
const volume = (n: number, cap: number) => Math.log1p(Math.min(n, cap)) / Math.log1p(cap);

export class Recommender {
  private readonly users;
  private readonly circles;
  private readonly joined = new Map<number, Set<number>>();
  private readonly engagement = new Map<number, number>();
  private readonly labels;
  readonly asOf: string;
  private readonly now: number;

  constructor(private readonly snapshot: Snapshot, asOf = snapshot.asOf) {
    this.asOf = z.iso.datetime().parse(asOf);
    this.now = Date.parse(this.asOf);
    this.users = new Map(snapshot.users.map(u => [u.id, u]));
    this.circles = new Map(snapshot.circles.map(c => [c.id, c]));
    this.labels = new Map(snapshot.topics.map(t => [t.slug, t.label.toLowerCase()]));
    for (const m of snapshot.memberships) {
      const ids = this.joined.get(m.user_id) ?? new Set<number>();
      ids.add(m.circle_id);
      this.joined.set(m.user_id, ids);
    }
    const totals = new Map<number, { sum: number; posts: number }>();
    for (const a of snapshot.activity) {
      const age = this.now - Date.parse(a.created_at);
      if (age < 0 || age >= 30 * DAY) continue;
      const total = totals.get(a.circle_id) ?? { sum: 0, posts: 0 };
      total.sum += a.reaction_count + a.comment_count + a.save_count;
      total.posts += 1;
      totals.set(a.circle_id, total);
    }
    for (const [id, total] of totals) this.engagement.set(id, volume(total.sum / total.posts, 30));
  }

  recommend(userId: number, limit = 5, debug = false): RecommendationResponse | null {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new RangeError('limit must be between 1 and 20');
    const user = this.users.get(userId);
    if (!user) return null;
    const joined = this.joined.get(userId) ?? new Set<number>();
    const explicit = new Set(user.topic_interests);
    // Each membership is one vote; its topic is weaker evidence than a stated interest.
    const inferred = new Map<string, number>();
    for (const id of joined) {
      const topic = this.circles.get(id)?.topic;
      if (topic) inferred.set(topic, (inferred.get(topic) ?? 0) + 1);
    }
    const inferenceTotal = [...inferred.values()].reduce((a, b) => a + b, 0);
    const strategy: Strategy = explicit.size ? 'personalized' : inferenceTotal ? 'membership' : 'discovery';
    const weights = POLICY.weights[strategy];
    const candidates: Candidate[] = [];
    for (const circle of this.snapshot.circles) {
      const age = (this.now - Date.parse(circle.last_activity_at)) / DAY;
      if (joined.has(circle.id) || circle.access !== 'public'
        || (circle.max_members !== null && circle.member_count >= circle.max_members)
        || age < 0 || age > POLICY.maxInactiveDays) continue;

      const topics = new Set([...(circle.topic ? [circle.topic] : []), ...circle.tags]);
      const matches = [...explicit].filter(t => topics.has(t)).sort();
      const coverage = explicit.size ? matches.length / explicit.size : 0;
      // A direct topic match beats incidental tags, even for users with many interests.
      const explicitScore = circle.topic && explicit.has(circle.topic)
        ? 0.85 + 0.15 * coverage : 0.35 * coverage;
      const inferredScore = circle.topic && inferenceTotal
        ? (inferred.get(circle.topic) ?? 0) / inferenceTotal : 0;
      const health = 0.45 * Math.exp(-age / 30)
        + 0.25 * volume(circle.feed_posts_30d, 20)
        + 0.2 * volume(circle.chat_messages_30d, 220)
        + 0.1 * (this.engagement.get(circle.id) ?? 0);
      const components = { explicit: explicitScore, inferred: inferredScore, health };
      const baseScore = weights.explicit * explicitScore + weights.inferred * inferredScore + weights.health * health;
      candidates.push({ circle, components, baseScore, explicitTopics: matches,
        inferredTopic: inferredScore > 0 ? circle.topic : null, daysSinceActivity: age });
    }

    // Greedy reranking: discount a repeat topic and never show more than two.
    // Untagged Circles do not all share an artificial "null topic" bucket.
    const selected: Recommendation[] = [];
    const topicCounts = new Map<string, number>();
    const remaining = new Set(candidates);
    while (selected.length < limit) {
      let best: Candidate | undefined;
      let bestScore = -1;
      let bestMultiplier = 1;
      for (const candidate of remaining) {
        const count = candidate.circle.topic ? topicCounts.get(candidate.circle.topic) ?? 0 : 0;
        if (count >= POLICY.maxPerTopic) continue;
        const multiplier = POLICY.repeatTopicMultiplier ** count;
        const score = candidate.baseScore * multiplier;
        if (score > bestScore || (score === bestScore && candidate.circle.id < (best?.circle.id ?? Infinity))) {
          best = candidate;
          bestScore = score;
          bestMultiplier = multiplier;
        }
      }
      if (!best) break;
      const c = best.circle;
      selected.push({
        circle_id: c.id, name: c.name, topic: c.topic, format: c.format,
        join_policy: c.join_policy,
        available_spots: c.max_members === null ? null : c.max_members - c.member_count,
        score: rounded(bestScore), explanation: this.explain(best),
        ...(debug ? { debug: {
          components: { explicit: rounded(best.components.explicit),
            inferred: rounded(best.components.inferred), health: rounded(best.components.health) },
          weights, base_score: rounded(best.baseScore), diversity_multiplier: bestMultiplier,
          matched_interests: best.explicitTopics, inferred_topic: best.inferredTopic,
          days_since_activity: rounded(best.daysSinceActivity),
        } } : {}),
      });
      remaining.delete(best);
      if (c.topic) topicCounts.set(c.topic, (topicCounts.get(c.topic) ?? 0) + 1);
    }
    return { user_id: userId, as_of: this.asOf, strategy, requested_limit: limit,
      returned: selected.length, recommendations: selected };
  }

  private explain(candidate: Candidate): string {
    const { circle, explicitTopics, inferredTopic, daysSinceActivity } = candidate;
    const label = (slug: string) => this.labels.get(slug) ?? slug.replaceAll('-', ' ');
    // Lead with primary-topic evidence when it exists, otherwise a matching tag.
    const primary = circle.topic && explicitTopics.includes(circle.topic) ? circle.topic : explicitTopics[0];
    let reason = primary
      ? `Matches your interest in ${label(primary)}`
      : inferredTopic
        ? `Related to ${label(inferredTopic)}, a topic in Circles you have joined`
        : 'A community to explore as you grow your career';
    reason += daysSinceActivity <= 30 ? ', with activity in the past month.' : ', with activity in the past 90 days.';
    reason += circle.join_policy === 'request'
      ? ' Space is available; you can request to join.'
      : ' Space is available to join.';
    return reason;
  }
}
