import { openDatabase, readDataset, seedDatabase } from './database.js';

const path = process.env.DATABASE_PATH ?? './var/circles.sqlite';
const db = openDatabase(path);
try {
  const data = readDataset();
  seedDatabase(db, data);
  console.log(`Imported ${data.users.length} users, ${data.circles.length} Circles, ${data.memberships.length} memberships, ${data.activity.length} posts into ${path}`);
} finally {
  db.close();
}
