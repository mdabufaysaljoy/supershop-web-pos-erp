import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Starts a throwaway single-node replica set (transactions supported) and connects mongoose.
 * Usage in a test file:
 *   const db = useMemoryMongo();   // registers beforeAll/afterAll/afterEach hooks
 */
export function useMemoryMongo({ beforeAll, afterAll, afterEach }) {
  let rs;
  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    await mongoose.connect(rs.getUri('test'));
  });
  afterEach(async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await rs?.stop();
  });
}
