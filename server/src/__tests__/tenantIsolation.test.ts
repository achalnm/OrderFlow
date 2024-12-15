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
      .send({ categoryId: catB.body._id, name: 'B Item', price: 10000 });

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
