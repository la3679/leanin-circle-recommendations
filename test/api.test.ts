import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadSnapshot, openDatabase, readDataset, seedDatabase } from '../src/database.js';
import { Recommender } from '../src/recommendations.js';

const db = openDatabase();
seedDatabase(db, readDataset());
const app = createApp(new Recommender(loadSnapshot(db)));
after(() => db.close());

test('API integrates database, recommendation engine, limits, and debug output', async () => {
  const res = await request(app).get('/users/7/recommendations?limit=3&debug=true').expect(200).expect('Content-Type', /json/);
  assert.equal(res.body.user_id, 7);
  assert.equal(res.body.returned, 3);
  assert.equal(res.body.requested_limit, 3);
  assert.ok(res.body.recommendations.every((r: { debug?: unknown }) => r.debug));
  const normal = await request(app).get('/users/42/recommendations').expect(200);
  assert.equal(normal.body.returned, 5);
  assert.ok(normal.body.recommendations.every((r: object) => !('debug' in r)));
  assert.equal(normal.headers['cache-control'], 'no-store');
});

test('all fixture users are reachable through the HTTP endpoint', async () => {
  for (const { id } of readDataset().users) {
    const res = await request(app).get(`/users/${id}/recommendations`).expect(200);
    assert.equal(res.body.user_id, id);
    assert.ok(res.body.returned > 0);
  }
});

test('health and unknown routes return structured JSON', async () => {
  const health = await request(app).get('/health').expect(200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.as_of, '2026-09-21T00:00:00.000Z');
  assert.equal((await request(app).get('/missing').expect(404)).body.error.code, 'NOT_FOUND');
  assert.equal((await request(app).get('/users/99999/recommendations').expect(404)).body.error.code, 'USER_NOT_FOUND');
});

test('rejects invalid IDs, limits, repeated parameters, and unsupported query fields', async () => {
  for (const id of ['0', '-1', 'abc', '1.2', '1e2', '9007199254740992', '%E0%A4%A']) {
    const res = await request(app).get(`/users/${id}/recommendations`).expect(400);
    assert.ok(res.body.error.code);
  }
  for (const query of ['limit=0', 'limit=21', 'limit=-1', 'limit=1.5', 'limit=1e1', 'limit=',
    'limit=2&limit=3', 'debug=1', 'debug=true&debug=false', 'unknown=x', 'limit[x]=2']) {
    const res = await request(app).get(`/users/7/recommendations?${query}`).expect(400);
    assert.ok(res.body.error.code);
  }
});
