import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getConfig } from './config';
import { logger } from './logger';
import { AuthPayload } from './middleware/auth';

let _io: SocketServer | null = null;

export function initSocketServer(httpServer: HttpServer, corsOrigin: string): SocketServer {
  _io = new SocketServer(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    transports: ['websocket', 'polling'],
  });

  _io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string;
    if (!token) return next(new Error('No token'));
    try {
      const config = getConfig();
      const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as AuthPayload;
      (socket as Socket & { user: AuthPayload }).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  _io.on('connection', (socket: Socket) => {
    const user = (socket as Socket & { user: AuthPayload }).user;
    if (!user) return;

    socket.join(`tenant:${user.tenantId}`);
    logger.info({ userId: user.userId, tenantId: user.tenantId }, 'Socket connected');

    socket.on('disconnect', () => {
      logger.info({ userId: user.userId }, 'Socket disconnected');
    });
  });

  const simNs = _io.of('/simulator');
  simNs.on('connection', (socket) => {
    const { tenantSlug } = socket.handshake.query;
    if (tenantSlug) socket.join(`sim:${tenantSlug}`);
    socket.on('subscribe-phone', (phone: string) => {
      if (phone && typeof phone === 'string') socket.join(`sim:${phone}`);
    });
  });

  return _io;
}

export function getSocketServer(): SocketServer | null {
  return _io;
}
