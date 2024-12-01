import { Types } from 'mongoose';
import { ConversationSession, BotState, ICartItem, ISessionContext } from '../models/ConversationSession';
import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';
import { Tenant } from '../models/Tenant';
import { Order } from '../models/Order';
import * as orderService from '../services/orderService';
import { getPaymentProvider } from '../payments';
import { getPrinterService } from '../printer';
import { getSocketServer } from '../socket';
import { logger } from '../logger';

export interface BotReply {
  text: string;
  options?: string[];
}

export interface IncomingMessage {
  tenantId: string;
  customerPhone: string;
  text: string;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fuzzyMatch(input: string, candidates: Array<{ id: string; name: string }>): { id: string; name: string } | null {
  const norm = normalize(input);
  for (const c of candidates) {
    if (normalize(c.name).includes(norm) || norm.includes(normalize(c.name))) return c;
  }
  if (norm.length >= 3) {
    for (const c of candidates) {
      if (levenshtein(norm, normalize(c.name)) <= 2) return c;
    }
  }
  return null;
}

function cartTotal(cart: ICartItem[]): { subtotal: number } {
  const subtotal = cart.reduce((acc, i) => acc + i.priceSnapshot * i.qty, 0);
  return { subtotal };
}

function formatCart(cart: ICartItem[], taxRate: number): string {
  if (cart.length === 0) return 'Your cart is empty.';
  const paise = (v: number) => `₹${(v / 100).toFixed(2)}`;
  const lines = cart.map((i) => `• ${i.nameSnapshot} x${i.qty} = ${paise(i.priceSnapshot * i.qty)}`);
  const { subtotal } = cartTotal(cart);
  const taxes = Math.round(subtotal * taxRate);
  const total = subtotal + taxes;
  return [
    '*Your Cart:*',
    ...lines,
    `─────────────`,
    `Subtotal: ${paise(subtotal)}`,
    `Tax (${Math.round(taxRate * 100)}%): ${paise(taxes)}`,
    `*Total: ${paise(total)}*`,
  ].join('\n');
}

async function getOrCreateSession(tenantId: Types.ObjectId, customerPhone: string): Promise<typeof ConversationSession.prototype> {
  let session = await ConversationSession.findOne({ tenantId, customerPhone });
  if (!session) {
    session = await ConversationSession.create({
      tenantId,
      customerPhone,
      state: 'GREETING',
      cart: [],
      context: {},
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
  } else {
    session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  }
  return session;
}

async function getTenant(tenantId: Types.ObjectId) {
  return Tenant.findById(tenantId);
}

export async function handleIncoming(msg: IncomingMessage): Promise<BotReply[]> {
  const tenantId = new Types.ObjectId(msg.tenantId);
  const session = await getOrCreateSession(tenantId, msg.customerPhone);
  const tenant = await getTenant(tenantId);
  if (!tenant) return [{ text: 'Service unavailable. Please try again later.' }];

  const taxRate = tenant.taxRatePercent / 100;
  const input = msg.text.trim();
  const lowerInput = input.toLowerCase();

  if (['menu', 'start', 'hi', 'hello', 'helo'].includes(lowerInput)) {
    return handleGreeting(session, tenant.name, tenantId, taxRate);
  }
  if (lowerInput === 'cart') {
    const replies: BotReply[] = [{ text: formatCart(session.cart, taxRate) }];
    if (session.cart.length > 0) {
      replies.push({ text: 'What would you like to do?', options: ['Checkout', 'Add more items', 'Clear cart'] });
    }
    await session.save();
    return replies;
  }
  if (lowerInput === 'clear') {
    session.cart = [];
    session.state = 'GREETING';
    session.context = {};
    await session.save();
    return [{ text: 'Cart cleared. Type *menu* to start over.' }];
  }
  if (lowerInput === 'help') {
    await session.save();
    return [{
      text: `*Available commands:*\n• *menu* - Browse menu\n• *cart* - View cart\n• *clear* - Clear cart\n• *status* - Last order status\n• *cancel* - Cancel current order\n• *help* - Show this help`,
    }];
  }
  if (lowerInput === 'status') {
    return handleStatus(session, tenantId, taxRate);
  }
  if (lowerInput === 'cancel') {
    return handleCancel(session, tenant.name);
  }

  switch (session.state) {
    case 'GREETING':
    case 'BROWSING_CATEGORIES':
      return handleCategorySelection(session, input, tenantId, taxRate, tenant.name);
    case 'BROWSING_ITEMS':
      return handleItemSelection(session, input, tenantId, taxRate);
    case 'ITEM_QTY':
      return handleQtyInput(session, input, tenantId, taxRate);
    case 'CART_REVIEW':
      return handleCartReview(session, input, tenantId, taxRate, tenant);
    case 'CHECKOUT_PAYMENT_CHOICE':
      return handlePaymentChoice(session, input, tenantId, taxRate, tenant);
    case 'AWAITING_PAYMENT':
      return [{ text: `Waiting for your payment. Click the link sent earlier or type *cancel* to abort.` }];
    case 'CONFIRMED':
      return handleGreeting(session, tenant.name, tenantId, taxRate);
    default:
      return handleGreeting(session, tenant.name, tenantId, taxRate);
  }
}

async function handleGreeting(
  session: InstanceType<typeof ConversationSession>,
  restaurantName: string,
  tenantId: Types.ObjectId,
  taxRate: number
): Promise<BotReply[]> {
  const categories = await MenuCategory.find({ tenantId, isActive: true }).sort({ sortOrder: 1 });
  if (categories.length === 0) {
    await session.save();
    return [{ text: `Welcome to *${restaurantName}*. Our menu is being set up. Please check back soon.` }];
  }
  session.state = 'BROWSING_CATEGORIES';
  session.context.lastCategoriesShown = categories.map((c) => ({ id: c._id.toString(), name: c.name }));
  session.markModified('context');
  await session.save();
  return [
    { text: `Welcome to *${restaurantName}*. Please choose a category:`, options: categories.map((c) => c.name) },
  ];
}

async function handleCategorySelection(
  session: InstanceType<typeof ConversationSession>,
  input: string,
  tenantId: Types.ObjectId,
  taxRate: number,
  restaurantName: string
): Promise<BotReply[]> {
  const cats = session.context.lastCategoriesShown ?? [];
  const num = parseInt(input);
  let category: { id: string; name: string } | undefined;

  if (!isNaN(num) && num >= 1 && num <= cats.length) {
    category = cats[num - 1];
  } else {
    const matched = fuzzyMatch(input, cats);
    if (matched) category = matched;
  }

  if (!category) {
    return handleFallback(session, 'BROWSING_CATEGORIES', async () =>
      handleGreeting(session, restaurantName, tenantId, taxRate)
    );
  }

  const items = await MenuItem.find({ tenantId, categoryId: category.id, isAvailable: true }).sort({ sortOrder: 1 });
  if (items.length === 0) {
    await session.save();
    return [{ text: `No items available in *${category.name}* right now.` },
            { text: 'Please choose another category:', options: (session.context.lastCategoriesShown ?? []).map((c) => c.name) }];
  }

  session.state = 'BROWSING_ITEMS';
  session.context.selectedCategoryId = category.id;
  session.context.selectedCategoryName = category.name;
  session.context.lastItemsShown = items.map((i) => ({
    id: i._id.toString(),
    name: i.name,
    price: i.price,
  }));
  session.markModified('context');
  await session.save();

  const paise = (v: number) => `₹${(v / 100).toFixed(2)}`;
  return [{
    text: `*${category.name}*\nChoose an item:`,
    options: items.map((i) => `${i.name} (${paise(i.price)})`),
  }];
}

async function handleItemSelection(
  session: InstanceType<typeof ConversationSession>,
  input: string,
  tenantId: Types.ObjectId,
  taxRate: number
): Promise<BotReply[]> {
  const items = session.context.lastItemsShown ?? [];
  const num = parseInt(input);
  let item: { id: string; name: string; price: number } | undefined;

  if (!isNaN(num) && num >= 1 && num <= items.length) {
    item = items[num - 1];
  } else {
    const matched = fuzzyMatch(input, items);
    if (matched) item = matched as { id: string; name: string; price: number };
  }

  if (['checkout', 'done', 'order'].includes(input.toLowerCase()) && session.cart.length > 0) {
    session.state = 'CART_REVIEW';
    session.markModified('context');
    await session.save();
    return [
      { text: formatCart(session.cart, taxRate) },
      { text: 'Ready to checkout?', options: ['Checkout', 'Add more items', 'Clear cart'] },
    ];
  }

  if (!item) {
    return handleFallback(session, 'BROWSING_ITEMS', async () => {
      await session.save();
      return [{ text: 'Please choose a valid item number or name.' }];
    });
  }

  session.state = 'ITEM_QTY';
  session.context.selectedItemId = item.id;
  session.context.selectedItemName = item.name;
  session.context.selectedItemPrice = item.price;
  session.markModified('context');
  await session.save();

  return [{ text: `How many *${item.name}* would you like? (enter a number)` }];
}

async function handleQtyInput(
  session: InstanceType<typeof ConversationSession>,
  input: string,
  tenantId: Types.ObjectId,
  taxRate: number
): Promise<BotReply[]> {
  const qty = parseInt(input);
  if (isNaN(qty) || qty < 1 || qty > 20) {
    await session.save();
    return [{ text: 'Please enter a valid quantity (1-20).' }];
  }

  const { selectedItemId, selectedItemName, selectedItemPrice } = session.context;
  if (!selectedItemId || !selectedItemName || selectedItemPrice === undefined) {
    session.state = 'BROWSING_CATEGORIES';
    await session.save();
    return [{ text: 'Something went wrong. Let\'s start over.' }];
  }

  const existing = session.cart.find((i) => i.menuItemId === selectedItemId);
  if (existing) {
    existing.qty += qty;
  } else {
    session.cart.push({
      menuItemId: selectedItemId,
      nameSnapshot: selectedItemName,
      priceSnapshot: selectedItemPrice,
      qty,
    });
  }
  session.markModified('cart');

  session.state = 'CART_REVIEW';
  session.markModified('context');
  await session.save();

  return [
    { text: `Added ${qty}x *${selectedItemName}* to cart.` },
    { text: formatCart(session.cart, taxRate) },
    { text: 'What next?', options: ['Checkout', 'Add more items', 'Clear cart'] },
  ];
}

async function handleCartReview(
  session: InstanceType<typeof ConversationSession>,
  input: string,
  tenantId: Types.ObjectId,
  taxRate: number,
  tenant: NonNullable<Awaited<ReturnType<typeof Tenant.findById>>>
): Promise<BotReply[]> {
  const lower = input.toLowerCase();

  if (lower.includes('checkout') || input === '1') {
    if (session.cart.length === 0) {
      await session.save();
      return [{ text: 'Your cart is empty. Type *menu* to start.' }];
    }
    session.state = 'CHECKOUT_PAYMENT_CHOICE';
    session.markModified('context');
    await session.save();
    return [{ text: 'How would you like to pay?', options: ['Pay online', 'Cash on delivery'] }];
  }

  if (lower.includes('add') || lower.includes('more') || input === '2') {
    return handleGreeting(session, (tenant as { name: string }).name, tenantId, taxRate);
  }

  if (lower.includes('clear') || input === '3') {
    session.cart = [];
    session.state = 'GREETING';
    session.context = {};
    session.markModified('cart');
    session.markModified('context');
    await session.save();
    return [{ text: 'Cart cleared. Type *menu* to start over.' }];
  }

  return handleFallback(session, 'CART_REVIEW', async () => {
    await session.save();
    return [
      { text: 'Please choose an option:' },
      { text: formatCart(session.cart, taxRate), options: ['Checkout', 'Add more items', 'Clear cart'] },
    ];
  });
}

async function handlePaymentChoice(
  session: InstanceType<typeof ConversationSession>,
  input: string,
  tenantId: Types.ObjectId,
  taxRate: number,
  tenant: NonNullable<Awaited<ReturnType<typeof Tenant.findById>>>
): Promise<BotReply[]> {
  const lower = input.toLowerCase();
  const isCOD = lower.includes('cash') || lower.includes('cod') || input === '2';
  const isOnline = lower.includes('online') || lower.includes('pay') || input === '1';

  if (!isCOD && !isOnline) {
    await session.save();
    return [{ text: 'Please choose: 1. Pay online  or  2. Cash on delivery' }];
  }

  const order = await orderService.createOrder({
    tenantId,
    customerPhone: session.customerPhone,
    items: session.cart.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty })),
    paymentMethod: isCOD ? 'cod' : 'online',
    source: 'whatsapp',
  });

  const io = getSocketServer();
  if (io) {
    const { serializeOrder } = await import('../utils/serializeOrder');
    io.to(`tenant:${tenantId.toString()}`).emit('order:new', serializeOrder(order));
  }

  if (isCOD) {
    order.status = 'confirmed';
    order.statusTransitions.push({ from: 'pending', to: 'confirmed', at: new Date() });
    await order.save();

    session.state = 'CONFIRMED';
    session.cart = [];
    session.context = { pendingOrderId: order._id.toString() };
    session.markModified('cart');
    session.markModified('context');
    await session.save();

    try {
      await getPrinterService().printReceipt(order, tenantId.toString());
    } catch {}

    return [{
      text: `*Order Confirmed*\nOrder: *${order.orderNumber}*\nPayment: Cash on Delivery\n\nWe will prepare your order shortly. Type *status* to track.`,
    }];
  }

  const paymentProvider = getPaymentProvider();
  const { url, providerRef } = await paymentProvider.createPaymentLink(order);
  order.paymentRef = providerRef;
  await order.save();

  session.state = 'AWAITING_PAYMENT';
  session.cart = [];
  session.context = { pendingOrderId: order._id.toString(), paymentUrl: url };
  session.markModified('cart');
  session.markModified('context');
  await session.save();

  return [
    {
      text: `*Pay for Order ${order.orderNumber}*\nClick the link below to complete payment:\n${url}\n\nYour order will be confirmed once payment is received.`,
    },
  ];
}

async function handleStatus(
  session: InstanceType<typeof ConversationSession>,
  tenantId: Types.ObjectId,
  taxRate: number
): Promise<BotReply[]> {
  const customer = await orderService.getOrCreateCustomer(tenantId, session.customerPhone);
  const lastOrder = await Order.findOne({ tenantId, customerId: customer._id }).sort({ createdAt: -1 });
  await session.save();
  if (!lastOrder) {
    return [{ text: 'No orders found. Type *menu* to place your first order!' }];
  }
  return [{
    text: `*Order ${lastOrder.orderNumber}*\nStatus: ${lastOrder.status.toUpperCase()}\nTotal: Rs.${(lastOrder.total / 100).toFixed(2)}`,
  }];
}

async function handleCancel(
  session: InstanceType<typeof ConversationSession>,
  restaurantName: string
): Promise<BotReply[]> {
  if (session.context.pendingOrderId) {
    try {
      await orderService.cancelOrder(
        session.context.pendingOrderId.includes(':')
          ? new Types.ObjectId(session.context.pendingOrderId.split(':')[0])
          : session.cart.length > 0
            ? new Types.ObjectId()
            : new Types.ObjectId(),
        session.context.pendingOrderId,
        'Cancelled by customer via chat'
      );
    } catch {}
  }
  session.cart = [];
  session.state = 'GREETING';
  session.context = {};
  session.markModified('cart');
  session.markModified('context');
  await session.save();
  return [{ text: `Order cancelled. Type *menu* to start a new order at *${restaurantName}*.` }];
}

async function handleFallback(
  session: InstanceType<typeof ConversationSession>,
  returnState: BotState,
  fallbackFn: () => Promise<BotReply[]>
): Promise<BotReply[]> {
  const count = (session.context.fallbackCount ?? 0) + 1;
  session.context.fallbackCount = count;
  session.markModified('context');

  if (count >= 2) {
    session.context.fallbackCount = 0;
    session.markModified('context');
    await session.save();
    return [{
      text: `I didn't understand that. Here's what you can do:`,
    }, {
      text: '',
      options: ['menu', 'cart', 'help', 'cancel'],
    }];
  }

  await session.save();
  return [{ text: "I didn't quite understand that. Please try again or type *help* for options." }];
}
