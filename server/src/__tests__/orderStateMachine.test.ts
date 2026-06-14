import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app';
import { clearDB, createTestTenant, createTestUser, createTestCategory, createTestItem } from './helpers';
import * as authService from '../services/authService';

const app = createApp();
let tenantId: mongoose.Types.ObjectId;
let accessToken: string;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI!);
  }
});

beforeEach(async () => {
  await clearDB();
  const reg = await request(app).post('/api/auth/register-tenant').send({
    tenantName: 'State Machine Test',
    ownerName: 'Owner',
    ownerEmail: 'sm@test.com',
    password: 'StateMachine@1',
  });
  accessToken = reg.body.accessToken;
  tenantId = new mongoose.Types.ObjectId(reg.body.tenant.id);

  const cat = await request(app)
    .post('/api/menu/categories')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Main' });

  await request(app)
    .post('/api/menu/items')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ categoryId: cat.body.id, name: 'Burger', price: 20000 });
});

afterAll(async () => {
  await mongoose.disconnect();
});

async function createOrder() {
  const items = await request(app)
    .get('/api/menu/items')
    .set('Authorization', `Bearer ${accessToken}`);
  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      customerPhone: '+919999999999',
      items: [{ menuItemId: items.body[0].id, qty: 1 }],
      paymentMethod: 'cod',
    });
  return res.body;
}

describe('Order state machine', () => {
  it('valid full transition: pending → confirmed → preparing → ready → completed', async () => {
    const order = await createOrder();
    expect(order.status).toBe('pending');

    for (const status of ['confirmed', 'preparing', 'ready', 'completed'] as const) {
      const res = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });

  it('rejects illegal transition: pending → preparing', async () => {
    const order = await createOrder();
    const res = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'preparing' });
    expect(res.status).toBe(409);
  });

  it('rejects transition from completed', async () => {
    const order = await createOrder();
    for (const s of ['confirmed', 'preparing', 'ready', 'completed'] as const) {
      await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: s });
    }
    const res = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(409);
  });

  it('allows cancel from pending', async () => {
    const order = await createOrder();
    const res = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'cancelled', reason: 'Test cancel' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('allows cancel from confirmed', async () => {
    const order = await createOrder();
    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'confirmed' });
    const res = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'cancelled', reason: 'Changed mind' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });
});
