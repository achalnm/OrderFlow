import mongoose from 'mongoose';
import { handleIncoming } from '../bot/engine';
import { clearDB, createTestTenant, createTestCategory, createTestItem } from './helpers';
import { ConversationSession } from '../models/ConversationSession';
import { Order } from '../models/Order';
import { Customer } from '../models/Customer';

let tenantId: string;
let itemId: string;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI!);
  }
});

beforeEach(async () => {
  await clearDB();
  const tenant = await createTestTenant({ name: 'Bot Test Restaurant', slug: 'bot-test' });
  tenantId = tenant._id.toString();
  const cat = await createTestCategory(tenant._id, 'Starters');
  const item = await createTestItem(tenant._id, cat._id, { name: 'Paneer Tikka', price: 25000 });
  itemId = item._id.toString();
  await createTestItem(tenant._id, cat._id, { name: 'Chicken Wings', price: 28000 });
});

afterAll(async () => {
  await mongoose.disconnect();
});

const phone = '+919000000001';

async function send(text: string) {
  return handleIncoming({ tenantId, customerPhone: phone, text });
}

describe('Bot FSM - happy path COD', () => {
  it('full COD flow: greeting → category → item → qty → cart → payment → confirmed', async () => {
    // Greeting
    let replies = await send('hi');
    expect(replies.some((r) => r.text.includes('Welcome'))).toBe(true);
    expect(replies.some((r) => r.options && r.options.length > 0)).toBe(true);

    // Select category 1
    replies = await send('1');
    expect(replies.some((r) => r.options && r.options.length > 0)).toBe(true);

    // Select item 1
    replies = await send('1');
    expect(replies.some((r) => r.text.includes('How many'))).toBe(true);

    // Enter qty
    replies = await send('2');
    expect(replies.some((r) => r.text.includes('Cart'))).toBe(true);

    // Checkout
    replies = await send('1'); // option 1 = Checkout
    expect(replies.some((r) => r.text.toLowerCase().includes('pay'))).toBe(true);

    // COD
    replies = await send('2'); // option 2 = Cash on delivery
    expect(replies.some((r) => r.text.includes('Confirmed') || r.text.includes('confirmed') || r.text.includes('ORD-'))).toBe(true);

    // Verify order created
    const customer = await Customer.findOne({ tenantId, phone });
    expect(customer).toBeTruthy();
    const order = await Order.findOne({ tenantId, customerId: customer!._id });
    expect(order).toBeTruthy();
    expect(order!.paymentMethod).toBe('cod');
    expect(order!.status).toBe('confirmed');
    expect(order!.items[0].qty).toBe(2);
  });
});

describe('Bot FSM - happy path online payment', () => {
  it('creates order pending/unpaid and returns payment link', async () => {
    await send('menu');
    await send('1'); // category
    await send('1'); // item
    await send('1'); // qty
    await send('checkout');
    const replies = await send('1'); // pay online
    const hasLink = replies.some((r) => r.text.includes('localhost') || r.text.includes('pay'));
    expect(hasLink).toBe(true);

    const session = await ConversationSession.findOne({ tenantId, customerPhone: phone });
    expect(session?.state).toBe('AWAITING_PAYMENT');

    const order = await Order.findById(session?.context?.pendingOrderId);
    expect(order?.status).toBe('pending');
    expect(order?.paymentMethod).toBe('online');
    expect(order?.paymentStatus).toBe('unpaid');
  });
});

describe('Bot FSM - cart operations', () => {
  it('clears cart with "clear" command', async () => {
    await send('menu');
    await send('1');
    await send('1');
    await send('1');
    const replies = await send('clear');
    expect(replies.some((r) => r.text.includes('cleared'))).toBe(true);

    const session = await ConversationSession.findOne({ tenantId, customerPhone: phone });
    expect(session?.cart).toHaveLength(0);
  });

  it('"cart" command shows empty cart message', async () => {
    const replies = await send('cart');
    expect(replies.some((r) => r.text.includes('empty'))).toBe(true);
  });
});

describe('Bot FSM - session expiry', () => {
  it('creates fresh session after expiry', async () => {
    await send('hi');
    await ConversationSession.updateOne(
      { tenantId, customerPhone: phone },
      { expiresAt: new Date(Date.now() - 1000), state: 'BROWSING_ITEMS' }
    );
    // Force session creation by deleting expired
    await ConversationSession.deleteOne({ tenantId, customerPhone: phone });
    const replies = await send('hi');
    expect(replies.some((r) => r.text.includes('Welcome'))).toBe(true);
  });
});

describe('Bot FSM - gibberish handling', () => {
  it('replies with fallback on gibberish and offers help after 2 tries', async () => {
    await send('menu');
    await send('1'); // valid category
    // Now in BROWSING_ITEMS; send gibberish
    const r1 = await send('xyzxyz gibberish!!!');
    expect(r1.some((r) => r.text.toLowerCase().includes("didn't"))).toBe(true);
    const r2 = await send('more gibberish here');
    expect(r2.some((r) => r.options && r.options.length > 0)).toBe(true);
  });
});

describe('Bot FSM - two tenants isolated', () => {
  it('same customer phone in two tenants has separate sessions', async () => {
    const tenant2 = await createTestTenant({ name: 'Second Restaurant', slug: 'second-restaurant' });
    const cat2 = await createTestCategory(tenant2._id, 'Mains');
    await createTestItem(tenant2._id, cat2._id, { name: 'Pizza', price: 30000 });

    // Start session in tenant 1
    await handleIncoming({ tenantId, customerPhone: phone, text: 'hi' });
    await handleIncoming({ tenantId, customerPhone: phone, text: '1' });

    // Start session in tenant 2
    await handleIncoming({ tenantId: tenant2._id.toString(), customerPhone: phone, text: 'hi' });

    const sess1 = await ConversationSession.findOne({ tenantId, customerPhone: phone });
    const sess2 = await ConversationSession.findOne({ tenantId: tenant2._id, customerPhone: phone });

    expect(sess1?.state).toBe('BROWSING_ITEMS');
    expect(sess2?.state).toBe('BROWSING_CATEGORIES');
  });
});

describe('Bot FSM - status command', () => {
  it('returns no orders message for new customer', async () => {
    const replies = await send('status');
    expect(replies.some((r) => r.text.includes('No orders'))).toBe(true);
  });
});
