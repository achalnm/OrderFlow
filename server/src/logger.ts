import pino from 'pino';
import { getConfig } from './config';

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
});
