import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  activitySchema, circleSchema, membershipSchema, topicSchema, userSchema,
  type Dataset, type Snapshot,
} from './models.js';

export const FIXTURE_AS_OF = '2026-09-21T00:00:00.000Z';

export function openDatabase(path = ':memory:'): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  return db;
}

export function readDataset(directory = resolve('data')): Dataset {
  const read = (name: string): unknown => JSON.parse(readFileSync(resolve(directory, `${name}.json`), 'utf8'));
  return {
    topics: z.array(topicSchema).parse(read('topics')),
    users: z.array(userSchema).parse(read('users')),
    circles: z.array(circleSchema).parse(read('circles')),
    memberships: z.array(membershipSchema).parse(read('memberships')),
    activity: z.array(activitySchema).parse(read('activity')),
  };
}

// Replace the local fixture atomically. A failed import preserves the previous data.
export function seedDatabase(db: DatabaseSync, data: Dataset, asOf = FIXTURE_AS_OF): void {
  z.iso.datetime().parse(asOf);
  db.exec(readFileSync(resolve('db/schema.sql'), 'utf8'));
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of ['activity', 'memberships', 'circle_tags', 'user_interests', 'circles', 'users', 'topics', 'metadata']) {
      db.exec(`DELETE FROM ${table}`);
    }
    const topic = db.prepare('INSERT INTO topics VALUES (?, ?, ?, ?)');
    for (const t of data.topics) topic.run(t.id, t.slug, t.label, t.domain);
    const user = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const interest = db.prepare('INSERT INTO user_interests VALUES (?, ?)');
    for (const u of data.users) {
      user.run(u.id, u.first_name, u.last_name, Number(u.has_photo), u.bio, u.job_title,
        u.company, u.industry, u.location, u.joined_at, u.profile_completeness);
      for (const slug of new Set(u.topic_interests)) interest.run(u.id, slug);
    }
    const circle = db.prepare('INSERT INTO circles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const tag = db.prepare('INSERT INTO circle_tags VALUES (?, ?)');
    for (const c of data.circles) {
      circle.run(c.id, c.name, c.slug, c.description, c.topic, c.cover_image_url, c.format,
        c.access, c.join_policy, c.max_members, c.member_count, c.created_at,
        c.last_activity_at, c.feed_posts_30d, c.chat_messages_30d);
      // The supplied generator can repeat a tag; tags have set semantics.
      for (const value of new Set(c.tags)) tag.run(c.id, value);
    }
    const membership = db.prepare('INSERT INTO memberships VALUES (?, ?, ?, ?)');
    for (const m of data.memberships) membership.run(m.user_id, m.circle_id, m.role, m.joined_at);
    const activity = db.prepare('INSERT INTO activity VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const a of data.activity) activity.run(a.id, a.circle_id, a.author_user_id, a.body,
      a.reaction_count, a.comment_count, a.save_count, a.created_at);

    const mismatch = db.prepare(`SELECT c.id FROM circles c LEFT JOIN memberships m ON m.circle_id = c.id
      GROUP BY c.id HAVING c.member_count != COUNT(m.user_id)`).get();
    if (mismatch) throw new Error(`Member count mismatch for Circle ${mismatch.id}`);
    db.prepare('INSERT INTO metadata VALUES (?, ?)').run('as_of', asOf);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// One load at startup is sufficient for a read-only snapshot this small.
// Row validation at this boundary also detects an incompatible or damaged database.
export function loadSnapshot(db: DatabaseSync): Snapshot {
  const metadata = db.prepare("SELECT value FROM metadata WHERE key = 'as_of'").get();
  if (!metadata) throw new Error('Database has no snapshot metadata. Run npm run seed.');
  const interests = db.prepare('SELECT * FROM user_interests ORDER BY topic_slug').all();
  const tags = db.prepare('SELECT * FROM circle_tags ORDER BY tag').all();
  return {
    asOf: z.iso.datetime().parse(metadata.value),
    topics: z.array(topicSchema).parse(db.prepare('SELECT * FROM topics ORDER BY id').all()),
    users: z.array(userSchema).parse(db.prepare('SELECT * FROM users ORDER BY id').all().map(u => ({
      ...u, has_photo: Boolean(u.has_photo),
      topic_interests: interests.filter(i => i.user_id === u.id).map(i => i.topic_slug),
    }))),
    circles: z.array(circleSchema).parse(db.prepare('SELECT * FROM circles ORDER BY id').all().map(c => ({
      ...c, topic: c.topic_slug,
      tags: tags.filter(t => t.circle_id === c.id).map(t => t.tag),
    }))),
    memberships: z.array(membershipSchema).parse(db.prepare('SELECT * FROM memberships ORDER BY user_id, circle_id').all()),
    activity: z.array(activitySchema).parse(db.prepare('SELECT * FROM activity ORDER BY id').all()),
  };
}
