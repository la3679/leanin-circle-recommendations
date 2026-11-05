import { loadSnapshot, openDatabase, readDataset, seedDatabase } from './database.js';
import { Recommender } from './recommendations.js';

const db = openDatabase();
try {
  seedDatabase(db, readDataset());
  const engine = new Recommender(loadSnapshot(db));
  for (const userId of [42, 7, 15, 23]) {
    const result = engine.recommend(userId)!;
    console.log(`\nUser ${userId} (${result.strategy})`);
    for (const [index, r] of result.recommendations.entries()) {
      console.log(`${index + 1}. #${r.circle_id} ${r.name} (${r.score.toFixed(3)}) — ${r.explanation}`);
    }
  }
} finally {
  db.close();
}
