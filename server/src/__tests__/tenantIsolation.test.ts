import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app';
import { clearDB } from './helpers';

const app = createApp();

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI!);
  }
});

afterEach(async () => {
  await clearDB();
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Tenant isolation - orders', () => {
  it('tenant A cannot read tenant B orders', async () => {
    // Create tenant A
    const regA = await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'Tenant A',
      ownerName: 'Owner A',
      ownerEmail: 'a@isolation.test',
      password: 'IsolationA@1',
    });
    const tokenA = regA.body.accessToken;

    // Create tenant B
    const regB = await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'Tenant B',
      ownerName: 'Owner B',
      ownerEmail: 'b@isolation.test',
      password: 'IsolationB@1',
    });
    const tokenB = regB.body.accessToken;

    // Create a category and item for tenant B
    const catB = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'B Category' });

    await request(app)
      .post('/api/menu/items')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ categoryId: catB.body.id, name: 'B Item', price: 10000 });

    // Tenant A tries to list orders - should be empty
    const resOrders = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resOrders.status).toBe(200);
    expect(resOrders.body.orders).toHaveLength(0);

    // Tenant A tries to list items - B's items should not show
    const resItems = await request(app)
      .get('/api/menu/items')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resItems.status).toBe(200);
    expect(resItems.body).toHaveLength(0);
  });
});

describe('Tenant isolation - cross-tenant writes', () => {
  let tokenA: string;
  let catBId: string;
  let itemBId: string;
  let orderBId: string;

  beforeEach(async () => {
    const regA = await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'Write Tenant A',
      ownerName: 'Owner A',
      ownerEmail: 'write-a@isolation.test',
      password: 'WriteA@1234',
    });
    tokenA = regA.body.accessToken;

    const regB = await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'Write Tenant B',
      ownerName: 'Owner B',
      ownerEmail: 'write-b@isolation.test',
      password: 'WriteB@1234',
    });
    const tokenB = regB.body.accessToken;

    const catRes = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'B Starters' });
    catBId = catRes.body.id;

    const itemRes = await request(app)
      .post('/api/menu/items')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ categoryId: catBId, name: 'B Paneer', price: 15000 });
    itemBId = itemRes.body.id;

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ customerPhone: '+919111111111', items: [{ menuItemId: itemBId, qty: 1 }], paymentMethod: 'cod' });
    orderBId = orderRes.body.id;
  });

  it('tenant A cannot read tenant B order by ID', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderBId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  it('tenant A cannot update tenant B order status', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderBId}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'confirmed' });
    expect(res.status).toBe(404);
  });

  it('tenant A cannot edit tenant B menu item', async () => {
    const res = await request(app)
      .patch(`/api/menu/items/${itemBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Hacked Name', price: 500 });
    expect(res.status).toBe(404);
  });

  it('tenant A cannot delete tenant B menu category', async () => {
    const res = await request(app)
      .delete(`/api/menu/categories/${catBId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });
});
