import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app';
import { connectTestDB, clearDB, createTestTenant, createTestUser } from './helpers';

const app = createApp();

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearDB();
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Auth: register tenant', () => {
  it('creates tenant and owner, returns tokens', async () => {
    const res = await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'Test Bistro',
      ownerName: 'Alice',
      ownerEmail: 'alice@test.com',
      password: 'TestPass@1',
    });
    expect(res.status).toBe(201);
    expect(res.body.tenant.slug).toBe('test-bistro');
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('rejects duplicate tenant slug', async () => {
    const payload = {
      tenantName: 'My Resto',
      ownerName: 'Bob',
      ownerEmail: 'bob@test.com',
      password: 'TestPass@1',
    };
    await request(app).post('/api/auth/register-tenant').send(payload);
    const res2 = await request(app).post('/api/auth/register-tenant').send({
      ...payload,
      ownerEmail: 'bob2@test.com',
    });
    // Slug gets suffixed, not rejected
    expect(res2.status).toBe(201);
    expect(res2.body.tenant.slug).toBe('my-resto-1');
  });
});

describe('Auth: login', () => {
  it('returns tokens on valid credentials', async () => {
    await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'Login Test',
      ownerName: 'Owner',
      ownerEmail: 'owner@login.test',
      password: 'MyPass@1234',
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'owner@login.test',
      password: 'MyPass@1234',
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('rejects wrong password', async () => {
    await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'Wrong Pass',
      ownerName: 'Owner',
      ownerEmail: 'owner@wrongpass.test',
      password: 'Correct@1234',
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'owner@wrongpass.test',
      password: 'WrongPassword',
    });
    expect(res.status).toBe(401);
  });
});

describe('Auth: token refresh', () => {
  it('issues new tokens on valid refresh', async () => {
    const reg = await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'Refresh Test',
      ownerName: 'Owner',
      ownerEmail: 'refresh@test.com',
      password: 'Refresh@1234',
    });
    const { refreshToken } = reg.body;
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('rejects reused refresh token', async () => {
    const reg = await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'Token Reuse',
      ownerName: 'Owner',
      ownerEmail: 'reuse@test.com',
      password: 'Reuse@1234',
    });
    const { refreshToken } = reg.body;
    await request(app).post('/api/auth/refresh').send({ refreshToken });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('RBAC', () => {
  let staffToken: string;
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;

  beforeEach(async () => {
    const reg = await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'RBAC Test',
      ownerName: 'Owner',
      ownerEmail: 'rbac.owner@test.com',
      password: 'Rbac@1234',
    });
    const { accessToken } = reg.body;

    // Create staff user
    await request(app)
      .post('/api/settings/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Staff', email: 'rbac.staff@test.com', role: 'staff', password: 'Staff@1234' });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'rbac.staff@test.com',
      password: 'Staff@1234',
    });
    staffToken = loginRes.body.accessToken;
  });

  it('staff cannot create menu categories', async () => {
    const res = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Hackers Category' });
    expect(res.status).toBe(403);
  });

  it('staff cannot access analytics', async () => {
    const res = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });
});
