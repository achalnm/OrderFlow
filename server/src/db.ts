import mongoose from 'mongoose';
import { logger } from './logger';

export async function connectDB(uri: string): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  mongoose.set('strictQuery', true);

  const isDev = process.env.NODE_ENV !== 'production';
  const isDefaultUri = uri === 'mongodb://localhost:27017/orderflow';

  if (isDev && isDefaultUri) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      logger.info('MongoDB connected (local)');
      return;
    } catch {
      logger.warn('local mongo not found, using in-memory');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const memUri = mongod.getUri();
      await mongoose.connect(memUri);
      (global as { __MONGOD__?: typeof mongod }).__MONGOD__ = mongod;
      logger.info({ uri: memUri }, 'in-memory mongo started');
      return;
    }
  }

  await mongoose.connect(uri);
  logger.info({ uri: uri.replace(/\/\/.*@/, '//***@') }, 'MongoDB connected');
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  const mongod = (global as { __MONGOD__?: { stop: () => Promise<void> } }).__MONGOD__;
  if (mongod) await mongod.stop();
  logger.info('MongoDB disconnected');
}
