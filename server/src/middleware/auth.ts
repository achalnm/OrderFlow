import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { UserRole } from '../models/User';
import { Types } from 'mongoose';

export interface AuthPayload {
  userId: string;
  tenantId: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided');
  }
  const token = header.slice(7);
  try {
    const config = getConfig();
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`);
    }
    next();
  };
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
