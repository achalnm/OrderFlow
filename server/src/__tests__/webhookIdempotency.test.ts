import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app';
import { clearDB } from './helpers';
import { Order } from '../models/Order';
import { WebhookEventLog } from '../models/WebhookEventLog';

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

describe('Payment webhook idempotency', () => {
  it('processes payment once and ignores duplicate event', async () => {
    // Create tenant, category, item, order
    const reg = await request(app).post('/api/auth/register-tenant').send({
      tenantName: 'Idempotency Test',
      ownerName: 'Owner',
      ownerEmail: 'idem@test.com',
      password: 'Idem@1234',
    });
    const token = reg.body.accessToken;

    const cat = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Main' });

    const item = await request(app)
      .post('/api/menu/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryId: cat.body._id, name: 'Pizza', price: 20000 });

    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerPhone: '+919000000099',
        items: [{ menuItemId: item.body._id, qty: 1 }],
        paymentMethod: 'online',
      });

    const orderId = order.body._id;
    const eventId = 'test_event_123';

    // First webhook call
    const res1 = await request(app)
      .post('/api/webhooks/mock')
      .send({ orderId, status: 'paid', eventId });
    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);

    // Verify order is paid
    const updatedOrder = await Order.findById(orderId);
    expect(updatedOrder?.paymentStatus).toBe('paid');

    // Second webhook call with same eventId (duplicate)
    const res2 = await request(app)
      .post('/api/webhooks/mock')
      .send({ orderId, status: 'paid', eventId });
    expect(res2.status).toBe(200);
    expect(res2.body.duplicate).toBe(true);

    // Verify only one webhook log entry
    const logs = await WebhookEventLog.find({ eventId });
    expect(logs).toHaveLength(1);
  });
});
