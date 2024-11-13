import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { getConfig } from '../config';
import { Tenant } from '../models/Tenant';
import { User, UserRole } from '../models/User';
import { AppError, UnauthorizedError } from '../utils/errors';
import { AuthPayload } from '../middleware/auth';

const SALT_ROUNDS = 10;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function generateTokens(payload: AuthPayload) {
  const config = getConfig();
  const accessToken = jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
  const refreshJti = randomBytes(16).toString('hex');
  const refreshToken = jwt.sign({ ...payload, jti: refreshJti }, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
  return { accessToken, refreshToken, refreshJti };
}

export async function registerTenant(data: {
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
}) {
  const baseSlug = slugify(data.tenantName);
  let slug = baseSlug;
  let suffix = 1;
  while (await Tenant.exists({ slug })) {
    slug = `${baseSlug}-${suffix++}`;
  }

  const tenant = await Tenant.create({ name: data.tenantName, slug });

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  const user = await User.create({
    tenantId: tenant._id,
    name: data.ownerName,
    email: data.ownerEmail,
    passwordHash,
    role: 'owner',
  });

  const payload: AuthPayload = {
    userId: user._id.toString(),
    tenantId: tenant._id.toString(),
    role: 'owner',
  };
  const { accessToken, refreshToken, refreshJti } = generateTokens(payload);
  await User.findByIdAndUpdate(user._id, { refreshJti });

  return { tenant, user, accessToken, refreshToken };
}

export async function login(email: string, password: string, tenantSlug?: string) {
  let tenantId: Types.ObjectId | undefined;
  if (tenantSlug) {
    const tenant = await Tenant.findOne({ slug: tenantSlug });
    if (!tenant) throw new UnauthorizedError('Invalid credentials');
    tenantId = tenant._id;
  }

  const query = tenantId
    ? { email: email.toLowerCase(), tenantId }
    : { email: email.toLowerCase() };
  const user = await User.findOne(query);
  if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const payload: AuthPayload = {
    userId: user._id.toString(),
    tenantId: user.tenantId.toString(),
    role: user.role,
  };
  const { accessToken, refreshToken, refreshJti } = generateTokens(payload);
  await User.findByIdAndUpdate(user._id, { refreshJti, lastLoginAt: new Date() });

  return { user, accessToken, refreshToken };
}

export async function refreshTokens(token: string) {
  const config = getConfig();
  let payload: AuthPayload & { jti?: string };
  try {
    payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as AuthPayload & { jti?: string };
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const user = await User.findById(payload.userId);
  if (!user || !user.refreshJti) throw new UnauthorizedError('Session revoked');

  if (user.refreshJti !== payload.jti) {
    throw new UnauthorizedError('Refresh token reuse detected');
  }

  const newPayload: AuthPayload = {
    userId: user._id.toString(),
    tenantId: user.tenantId.toString(),
    role: user.role,
  };
  const { accessToken, refreshToken, refreshJti } = generateTokens(newPayload);
  await User.findByIdAndUpdate(user._id, { refreshJti });

  return { accessToken, refreshToken };
}

export async function logout(userId: string) {
  await User.findByIdAndUpdate(userId, { $unset: { refreshJti: 1, refreshTokenHash: 1 } });
}

export async function createUser(data: {
  tenantId: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: UserRole;
}) {
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  return User.create({
    tenantId: data.tenantId,
    name: data.name,
    email: data.email.toLowerCase(),
    passwordHash,
    role: data.role,
  });
}
