import { MongoMemoryServer } from 'mongodb-memory-server';

module.exports = async () => {
  const mongod = (global as { __MONGOD__?: MongoMemoryServer }).__MONGOD__;
  if (mongod) await mongod.stop();
};
