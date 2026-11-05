import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSnapshot, openDatabase, readDataset, seedDatabase } from '../src/database.js';

test('imports every row, reconstructs relationships, and reseeds idempotently', () => {
  const db = openDatabase();
  try {
    const data = readDataset();
    seedDatabase(db, data);
    const first = loadSnapshot(db);
    for (const key of ['users', 'topics', 'circles', 'memberships', 'activity'] as const) {
      assert.equal(first[key].length, data[key].length);
    }
    assert.deepEqual(first.users.find(u => u.id === 7)!.topic_interests.sort(), ['leadership-skills', 'public-speaking']);
    assert.equal(first.circles.find(c => c.id === 27)!.topic, null);
    for (const c of first.circles) assert.equal(c.tags.length, new Set(c.tags).size);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    seedDatabase(db, data);
    assert.deepEqual(loadSnapshot(db), first);
  } finally { db.close(); }
});

test('failed import rolls back rather than destroying previous snapshot', () => {
  const db = openDatabase();
  try {
    seedDatabase(db, readDataset());
    const before = loadSnapshot(db);
    const bad = readDataset();
    bad.memberships[0]!.user_id = 99999;
    assert.throws(() => seedDatabase(db, bad));
    assert.deepEqual(loadSnapshot(db), before);
    const mismatched = readDataset();
    mismatched.circles[0]!.member_count += 1;
    assert.throws(() => seedDatabase(db, mismatched), /Member count mismatch/);
    assert.deepEqual(loadSnapshot(db), before);
  } finally { db.close(); }
});

test('database enforces membership uniqueness and member-authored activity', () => {
  const db = openDatabase();
  try {
    const data = readDataset();
    seedDatabase(db, data);
    const m = data.memberships[0]!;
    assert.throws(() => db.prepare('INSERT INTO memberships VALUES (?, ?, ?, ?)').run(m.user_id, m.circle_id, m.role, m.joined_at));
    assert.throws(() => db.prepare('INSERT INTO activity VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(9999, 5, 42, 'Invalid author', 0, 0, 0, '2026-09-21T00:00:00.000Z'));
    assert.throws(() => db.prepare('UPDATE circles SET member_count = -1 WHERE id = 5').run());
  } finally { db.close(); }
});
