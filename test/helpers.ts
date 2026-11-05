import { FIXTURE_AS_OF, readDataset } from '../src/database.js';
import type { Circle, Snapshot } from '../src/models.js';

const fixture = readDataset();
export function snapshot(): Snapshot { return { ...structuredClone(fixture), asOf: FIXTURE_AS_OF }; }
export function circle(data: Snapshot, id: number): Circle { return data.circles.find(c => c.id === id)!; }
