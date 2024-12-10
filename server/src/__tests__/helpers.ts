import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';

export async function connectTestDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI!);
  }
}

export async function clearDB() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

export async function createTestTenant(overrides: Partial<{ name: string; slug: string }> = {}) {
  return Tenant.create({
    name: overrides.name ?? 'Test Restaurant',
    slug: overrides.slug ?? 'test-restaurant',
    taxRatePercent: 5,
  });
}

export async function createTestUser(
  tenantId: mongoose.Types.ObjectId,
  overrides: Partial<{ email: string; role: 'owner' | 'manager' | 'staff'; password: string }> = {}
) {
  const passwordHash = await bcrypt.hash(overrides.password ?? 'Test@1234', 10);
  return User.create({
    tenantId,
    name: 'Test User',
    email: overrides.email ?? 'test@test.com',
    passwordHash,
    role: overrides.role ?? 'owner',
  });
}

export async function createTestCategory(tenantId: mongoose.Types.ObjectId, name = 'Test Category') {
  return MenuCategory.create({ tenantId, name, sortOrder: 0 });
}

export async function createTestItem(
  tenantId: mongoose.Types.ObjectId,
  categoryId: mongoose.Types.ObjectId,
  overrides: Partial<{ name: string; price: number; isAvailable: boolean }> = {}
) {
  return MenuItem.create({
    tenantId,
    categoryId,
    name: overrides.name ?? 'Test Item',
    price: overrides.price ?? 10000,
    isAvailable: overrides.isAvailable ?? true,
  });
}
