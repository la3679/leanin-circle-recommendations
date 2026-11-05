import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POLICY, Recommender } from '../src/recommendations.js';
import { circle, snapshot } from './helpers.js';

test('cold-start member gets healthy, varied discoveries without invented interests', () => {
  const result = new Recommender(snapshot()).recommend(42)!;
  assert.equal(result.strategy, 'discovery');
  assert.equal(result.returned, 5);
  assert.ok(new Set(result.recommendations.map(r => r.topic)).size >= 3);
  assert.ok(result.recommendations.every(r => !r.explanation.includes('your interest') && !r.explanation.includes('you have joined')));
});

test('obvious matches surface both planted leadership and speaking Circles', () => {
  const result = new Recommender(snapshot()).recommend(7)!;
  const ids = result.recommendations.map(r => r.circle_id);
  assert.ok(ids.includes(5), `Expected #5, got ${ids}`);
  assert.ok(ids.includes(6), `Expected #6, got ${ids}`);
  assert.equal(result.strategy, 'personalized');
});

test('near-duplicate negotiation Circles cannot consume the list', () => {
  const results = new Recommender(snapshot()).recommend(15)!.recommendations;
  const negotiations = results.filter(r => [10, 11, 12].includes(r.circle_id));
  assert.ok(negotiations.length >= 1 && negotiations.length <= 2);
  assert.ok(results.some(r => r.topic === 'confidence'));
});

test('promotion scenario favors healthy request-to-join alternative', () => {
  const result = new Recommender(snapshot()).recommend(23)!;
  assert.equal(result.recommendations[0]!.circle_id, 22);
  assert.ok(result.recommendations.every(r => r.circle_id !== 20 && r.circle_id !== 21));
  assert.match(result.recommendations[0]!.explanation, /request to join/);
});

test('all 100 users receive deterministic, eligible, bounded, diverse results', () => {
  const data = snapshot();
  const engine = new Recommender(data);
  for (const user of data.users) {
    const result = engine.recommend(user.id, 20, true)!;
    assert.deepEqual(result, engine.recommend(user.id, 20, true));
    assert.ok(result.returned > 0 && result.returned <= 20);
    assert.equal(result.returned, result.recommendations.length);
    const seen = new Set<number>();
    const topics = new Map<string, number>();
    let previous = Infinity;
    for (const r of result.recommendations) {
      const c = circle(data, r.circle_id);
      assert.equal(c.access, 'public');
      assert.ok(!data.memberships.some(m => m.user_id === user.id && m.circle_id === c.id));
      assert.ok(c.max_members === null || c.member_count < c.max_members);
      assert.ok((Date.parse(data.asOf) - Date.parse(c.last_activity_at)) / 86_400_000 <= POLICY.maxInactiveDays);
      assert.ok(!seen.has(c.id));
      seen.add(c.id);
      if (c.topic) topics.set(c.topic, (topics.get(c.topic) ?? 0) + 1);
      assert.ok(r.score >= 0 && r.score <= 1 && r.score <= previous);
      previous = r.score;
      assert.ok(r.explanation.length > 20);
      assert.ok(r.debug && r.debug.components.health >= 0 && r.debug.components.health <= 1);
      assert.deepEqual(r.debug.matched_interests.filter(t => !user.topic_interests.includes(t)), []);
      assert.equal(r.available_spots, c.max_members === null ? null : c.max_members - c.member_count);
    }
    assert.ok([...topics.values()].every(n => n <= 2));
  }
});

test('visibility filter works independently of inactivity', () => {
  const data = snapshot();
  const c = circle(data, 5);
  c.access = 'unlisted';
  assert.ok(!new Recommender(data).recommend(7, 20)!.recommendations.some(r => r.circle_id === 5));
});

test('inactivity filter works for a public Circle, even with stale positive aggregates', () => {
  const data = snapshot();
  const c = circle(data, 5);
  c.last_activity_at = '2026-01-01T00:00:00.000Z';
  assert.equal(c.access, 'public');
  assert.ok(!new Recommender(data).recommend(7, 20)!.recommendations.some(r => r.circle_id === 5));
});

test('capacity changes remove a match; unlimited capacity stays eligible', () => {
  const data = snapshot();
  const c = circle(data, 5);
  c.max_members = c.member_count;
  assert.ok(!new Recommender(data).recommend(7, 20)!.recommendations.some(r => r.circle_id === 5));
  c.max_members = null;
  assert.ok(new Recommender(data).recommend(7, 20)!.recommendations.some(r => r.circle_id === 5));
  c.max_members = c.member_count - 1;
  assert.ok(!new Recommender(data).recommend(7, 20)!.recommendations.some(r => r.circle_id === 5));
});

test('joining a recommended Circle removes it from future recommendations', () => {
  const data = snapshot();
  const id = new Recommender(data).recommend(7)!.recommendations[0]!.circle_id;
  data.memberships.push({ user_id: 7, circle_id: id, role: 'member', joined_at: data.asOf });
  assert.ok(!new Recommender(data).recommend(7, 20)!.recommendations.some(r => r.circle_id === id));
});

test('changing stated interests changes ranking without user-ID special cases', () => {
  const data = snapshot();
  data.users.find(u => u.id === 42)!.topic_interests = ['getting-promoted'];
  const result = new Recommender(data).recommend(42)!;
  assert.equal(result.strategy, 'personalized');
  assert.equal(result.recommendations[0]!.circle_id, 22);
  assert.match(result.recommendations[0]!.explanation, /your interest in getting promoted/);
});

test('membership-only personalization describes inference honestly', () => {
  const data = snapshot();
  data.users.find(u => u.id === 7)!.topic_interests = [];
  data.memberships = data.memberships.filter(m => m.user_id !== 7);
  data.memberships.push({ user_id: 7, circle_id: 5, role: 'member', joined_at: data.asOf });
  const result = new Recommender(data).recommend(7)!;
  assert.equal(result.strategy, 'membership');
  assert.equal(result.recommendations[0]!.topic, 'leadership-skills');
  assert.match(result.recommendations[0]!.explanation, /a topic in Circles you have joined/);
  assert.ok(!result.recommendations.some(r => r.explanation.includes('your interest')));
});

test('primary topic matches do not require the same topic in tags', () => {
  const data = snapshot();
  circle(data, 22).tags = [];
  assert.equal(new Recommender(data).recommend(23)!.recommendations[0]!.circle_id, 22);
});

test('missing topics and descriptions do not block healthy discoveries or share a diversity bucket', () => {
  const data = snapshot();
  data.circles = data.circles.filter(c => [3, 5, 6].includes(c.id));
  for (const c of data.circles) { c.topic = null; c.tags = []; c.description = null; }
  const result = new Recommender(data).recommend(42)!;
  assert.equal(result.returned, 3);
  assert.ok(result.recommendations.every(r => r.topic === null));
});

test('profile completeness and personal demographics do not change recommendations', () => {
  const data = snapshot();
  const before = new Recommender(data).recommend(7);
  Object.assign(data.users.find(u => u.id === 7)!, {
    first_name: 'Different', last_name: 'Name', has_photo: false, bio: null,
    company: null, industry: null, location: null, job_title: null, profile_completeness: 0,
  });
  assert.deepEqual(new Recommender(data).recommend(7), before);
});

test('activity decline reduces health, while high activity cannot outrank a direct healthy match', () => {
  const data = snapshot();
  // Isolate this Circle so a changed score cannot remove it via the diversity cap.
  data.circles = [circle(data, 5)];
  const before = new Recommender(data).recommend(7, 20, true)!.recommendations.find(r => r.circle_id === 5)!;
  const c = circle(data, 5);
  c.feed_posts_30d = 0;
  c.chat_messages_30d = 0;
  c.last_activity_at = '2026-08-01T00:00:00.000Z';
  const after = new Recommender(data).recommend(7, 20, true)!.recommendations.find(r => r.circle_id === 5)!;
  assert.ok(after.debug!.components.health < before.debug!.components.health);
  const noisy = snapshot();
  noisy.users.find(u => u.id === 42)!.topic_interests = ['getting-promoted'];
  circle(noisy, 27).feed_posts_30d = 1_000_000;
  circle(noisy, 27).chat_messages_30d = 1_000_000;
  assert.equal(new Recommender(noisy).recommend(42)!.recommendations[0]!.circle_id, 22);
});

test('clock is injectable; future and old activity are not recommended', () => {
  const data = snapshot();
  const engine = new Recommender(data, '2027-09-21T00:00:00.000Z');
  assert.equal(engine.recommend(42)!.returned, 0);
  circle(data, 5).last_activity_at = '2026-10-01T00:00:00.000Z';
  assert.ok(!new Recommender(data).recommend(7, 20)!.recommendations.some(r => r.circle_id === 5));
  assert.throws(() => new Recommender(data, 'not a date'));
});

test('returns fewer results without relaxing eligibility and supports an empty catalog', () => {
  const data = snapshot();
  data.circles = [circle(data, 22)];
  assert.equal(new Recommender(data).recommend(42, 5)!.returned, 1);
  data.circles = [];
  assert.equal(new Recommender(data).recommend(42)!.returned, 0);
});

test('equal scores use Circle ID independent of input order; debug is opt-in', () => {
  const data = snapshot();
  const a = { ...circle(data, 5), id: 101, topic: null, tags: [] };
  const b = { ...a, id: 102 };
  data.circles = [b, a];
  data.activity = [];
  const engine = new Recommender(data);
  const result = engine.recommend(42)!;
  assert.deepEqual(result.recommendations.map(r => r.circle_id), [101, 102]);
  assert.ok(result.recommendations.every(r => !('debug' in r)));
  assert.ok(engine.recommend(42, 5, true)!.recommendations.every(r => r.debug));
  assert.equal(engine.recommend(99999), null);
});
