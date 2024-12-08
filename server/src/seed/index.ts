import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { getConfig } from '../config';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';
import { Customer } from '../models/Customer';
import { Order } from '../models/Order';
import { Counter } from '../models/Counter';
import { nextOrderNumber } from '../models/Counter';
import { logger } from '../logger';

const SALT_ROUNDS = 10;

export async function seed(disconnectAfter = true) {
  const config = getConfig();
  const { connectDB } = await import('../db');
  await connectDB(config.MONGODB_URI);
  logger.info('Connected to MongoDB for seeding');

  await Tenant.deleteMany({ slug: 'spice-garden' });

  // create demo tenant
  const tenant = await Tenant.create({
    name: 'Spice Garden',
    slug: 'spice-garden',
    status: 'active',
    plan: 'pro',
    whatsappNumber: '+919876543210',
    taxRatePercent: 5,
    printerConfig: { type: 'mock' },
  });

  const ownerHash = await bcrypt.hash('Demo@1234', SALT_ROUNDS);
  const managerHash = await bcrypt.hash('Demo@1234', SALT_ROUNDS);
  const staffHash = await bcrypt.hash('Demo@1234', SALT_ROUNDS);

  await User.create([
    { tenantId: tenant._id, name: 'Rajesh Kumar', email: 'owner@demo.test', passwordHash: ownerHash, role: 'owner' },
    { tenantId: tenant._id, name: 'Priya Sharma', email: 'manager@demo.test', passwordHash: managerHash, role: 'manager' },
    { tenantId: tenant._id, name: 'Arjun Singh', email: 'staff@demo.test', passwordHash: staffHash, role: 'staff' },
  ]);

  const [starters, mains, breads, beverages] = await MenuCategory.create([
    { tenantId: tenant._id, name: 'Starters', sortOrder: 0, isActive: true },
    { tenantId: tenant._id, name: 'Main Course', sortOrder: 1, isActive: true },
    { tenantId: tenant._id, name: 'Breads & Rice', sortOrder: 2, isActive: true },
    { tenantId: tenant._id, name: 'Beverages', sortOrder: 3, isActive: true },
  ]);

  const items = await MenuItem.create([
    { tenantId: tenant._id, categoryId: starters._id, name: 'Paneer Tikka', description: 'Marinated paneer grilled in tandoor', price: 28000, isAvailable: true, tags: ['veg', 'popular'], sortOrder: 0 },
    { tenantId: tenant._id, categoryId: starters._id, name: 'Chicken 65', description: 'Spicy deep-fried chicken', price: 32000, isAvailable: true, tags: ['non-veg', 'spicy'], sortOrder: 1 },
    { tenantId: tenant._id, categoryId: starters._id, name: 'Veg Manchurian', description: 'Crispy veg balls in Manchurian sauce', price: 22000, isAvailable: true, tags: ['veg'], sortOrder: 2 },
    { tenantId: tenant._id, categoryId: starters._id, name: 'Fish Fry', description: 'Fresh fish marinated and fried', price: 35000, isAvailable: true, tags: ['non-veg', 'seafood'], sortOrder: 3 },
    { tenantId: tenant._id, categoryId: starters._id, name: 'Aloo Tikki', description: 'Crispy potato patties', price: 15000, isAvailable: true, tags: ['veg'], sortOrder: 4 },
    { tenantId: tenant._id, categoryId: mains._id, name: 'Butter Chicken', description: 'Tender chicken in rich tomato-cream sauce', price: 38000, isAvailable: true, tags: ['non-veg', 'popular', 'creamy'], sortOrder: 0 },
    { tenantId: tenant._id, categoryId: mains._id, name: 'Palak Paneer', description: 'Fresh cottage cheese in spiced spinach gravy', price: 30000, isAvailable: true, tags: ['veg', 'healthy'], sortOrder: 1 },
    { tenantId: tenant._id, categoryId: mains._id, name: 'Dal Makhani', description: 'Slow-cooked black lentils with cream', price: 25000, isAvailable: true, tags: ['veg', 'popular'], sortOrder: 2 },
    { tenantId: tenant._id, categoryId: mains._id, name: 'Lamb Rogan Josh', description: 'Aromatic Kashmiri lamb curry', price: 45000, isAvailable: true, tags: ['non-veg', 'spicy'], sortOrder: 3 },
    { tenantId: tenant._id, categoryId: mains._id, name: 'Chicken Biryani', description: 'Fragrant basmati rice with spiced chicken', price: 35000, isAvailable: true, tags: ['non-veg', 'popular', 'rice'], sortOrder: 4 },
    { tenantId: tenant._id, categoryId: mains._id, name: 'Veg Biryani', description: 'Aromatic rice with mixed vegetables', price: 28000, isAvailable: true, tags: ['veg', 'rice'], sortOrder: 5 },
    { tenantId: tenant._id, categoryId: mains._id, name: 'Shahi Paneer', description: 'Paneer in rich cashew-cream gravy', price: 32000, isAvailable: true, tags: ['veg', 'rich'], sortOrder: 6 },
    { tenantId: tenant._id, categoryId: breads._id, name: 'Butter Naan', description: 'Soft leavened bread with butter', price: 5000, isAvailable: true, tags: ['veg', 'bread'], sortOrder: 0 },
    { tenantId: tenant._id, categoryId: breads._id, name: 'Garlic Naan', description: 'Naan topped with garlic butter', price: 6000, isAvailable: true, tags: ['veg', 'bread'], sortOrder: 1 },
    { tenantId: tenant._id, categoryId: breads._id, name: 'Tandoori Roti', description: 'Whole wheat flatbread from tandoor', price: 3500, isAvailable: true, tags: ['veg', 'bread', 'healthy'], sortOrder: 2 },
    { tenantId: tenant._id, categoryId: breads._id, name: 'Jeera Rice', description: 'Basmati rice tempered with cumin', price: 12000, isAvailable: true, tags: ['veg', 'rice'], sortOrder: 3 },
    { tenantId: tenant._id, categoryId: beverages._id, name: 'Mango Lassi', description: 'Chilled yogurt drink with fresh mango', price: 12000, isAvailable: true, tags: ['veg', 'cold', 'popular'], sortOrder: 0 },
    { tenantId: tenant._id, categoryId: beverages._id, name: 'Masala Chai', description: 'Spiced Indian tea with milk', price: 5000, isAvailable: true, tags: ['veg', 'hot'], sortOrder: 1 },
  ]);

  const customers = await Customer.create([
    { tenantId: tenant._id, phone: '+919001001001', name: 'Amit Patel', totalOrders: 0 },
    { tenantId: tenant._id, phone: '+919001001002', name: 'Sunita Rao', totalOrders: 0 },
    { tenantId: tenant._id, phone: '+919001001003', name: 'Kiran Mehta', totalOrders: 0 },
    { tenantId: tenant._id, phone: '+919001001004', name: 'Deepak Gupta', totalOrders: 0 },
    { tenantId: tenant._id, phone: '+919001001005', name: 'Lakshmi Nair', totalOrders: 0 },
    { tenantId: tenant._id, phone: '+919001001006', name: 'Rahul Verma', totalOrders: 0 },
  ]);

  const statuses: Array<'completed' | 'cancelled' | 'confirmed'> = ['completed', 'completed', 'completed', 'cancelled', 'confirmed'];
  const paymentMethods: Array<'cod' | 'online'> = ['cod', 'cod', 'online'];
  const sources: Array<'whatsapp' | 'dashboard'> = ['whatsapp', 'dashboard', 'whatsapp'];

  for (let i = 0; i < 40; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const orderDate = new Date();
    orderDate.setDate(orderDate.getDate() - daysAgo);
    orderDate.setHours(hoursAgo, Math.floor(Math.random() * 60), 0, 0);

    const customer = customers[Math.floor(Math.random() * customers.length)];
    const numItems = Math.floor(Math.random() * 3) + 1;
    const selectedItems = items.sort(() => 0.5 - Math.random()).slice(0, numItems);

    const orderItems = selectedItems.map((item) => ({
      menuItemId: item._id,
      nameSnapshot: item.name,
      priceSnapshot: item.price,
      qty: Math.floor(Math.random() * 2) + 1,
    }));

    const subtotal = orderItems.reduce((acc, i) => acc + i.priceSnapshot * i.qty, 0);
    const taxes = Math.round(subtotal * 0.05);
    const total = subtotal + taxes;

    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const orderNumber = await nextOrderNumber(tenant._id);

    type Transition = { from: string | null; to: string; at: Date };
    const transitions: Transition[] = [{ from: null, to: 'pending', at: orderDate }];
    if (status !== 'cancelled') {
      transitions.push({ from: 'pending', to: 'confirmed', at: new Date(orderDate.getTime() + 2 * 60000) });
    }
    if (status === 'completed') {
      transitions.push({ from: 'confirmed', to: 'preparing', at: new Date(orderDate.getTime() + 5 * 60000) });
      transitions.push({ from: 'preparing', to: 'ready', at: new Date(orderDate.getTime() + 20 * 60000) });
      transitions.push({ from: 'ready', to: 'completed', at: new Date(orderDate.getTime() + 30 * 60000) });
    }

    await Order.create({
      tenantId: tenant._id,
      orderNumber,
      customerId: customer._id,
      items: orderItems,
      subtotal,
      taxes,
      total,
      status,
      paymentMethod,
      paymentStatus: status === 'completed' ? 'paid' : 'unpaid',
      source,
      statusTransitions: transitions,
      createdAt: orderDate,
      updatedAt: orderDate,
    });

    await Customer.findByIdAndUpdate(customer._id, {
      $inc: { totalOrders: 1 },
      lastOrderAt: orderDate,
    });
  }

  // 2 live pending orders
  for (let i = 0; i < 2; i++) {
    const customer = customers[i];
    const selectedItems = items.slice(0, 2 + i);
    const orderItems = selectedItems.map((item) => ({
      menuItemId: item._id,
      nameSnapshot: item.name,
      priceSnapshot: item.price,
      qty: 1,
    }));
    const subtotal = orderItems.reduce((acc, it) => acc + it.priceSnapshot * it.qty, 0);
    const taxes = Math.round(subtotal * 0.05);
    const total = subtotal + taxes;
    const orderNumber = await nextOrderNumber(tenant._id);

    await Order.create({
      tenantId: tenant._id,
      orderNumber,
      customerId: customer._id,
      items: orderItems,
      subtotal,
      taxes,
      total,
      status: 'pending',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      source: 'whatsapp',
      statusTransitions: [{ from: null, to: 'pending', at: new Date() }],
    });

    await Customer.findByIdAndUpdate(customer._id, {
      $inc: { totalOrders: 1 },
      lastOrderAt: new Date(),
    });
  }

  logger.info('seed done');
  logger.info('Tenant: Spice Garden (slug: spice-garden)');
  logger.info('Owner: owner@demo.test / Demo@1234');
  logger.info('Manager: manager@demo.test / Demo@1234');
  logger.info('Staff: staff@demo.test / Demo@1234');

  if (disconnectAfter) {
    const { disconnectDB } = await import('../db');
    await disconnectDB();
  }
}

if (process.argv[1] && process.argv[1].includes('seed')) {
  seed(true).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
