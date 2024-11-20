import { Types } from 'mongoose';
import { Order, OrderStatus, IOrderItem, ORDER_TRANSITIONS, PaymentMethod } from '../models/Order';
import { Customer } from '../models/Customer';
import { MenuItem } from '../models/MenuItem';
import { nextOrderNumber } from '../models/Counter';
import { Tenant } from '../models/Tenant';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';

export interface CreateOrderInput {
  tenantId: Types.ObjectId;
  customerPhone: string;
  customerName?: string;
  items: Array<{ menuItemId: string; qty: number }>;
  paymentMethod: PaymentMethod;
  source: 'whatsapp' | 'dashboard';
  notes?: string;
}

export async function getOrCreateCustomer(tenantId: Types.ObjectId, phone: string, name?: string) {
  let customer = await Customer.findOne({ tenantId, phone });
  if (!customer) {
    customer = await Customer.create({ tenantId, phone, name });
  } else if (name && !customer.name) {
    customer.name = name;
    await customer.save();
  }
  return customer;
}

export async function createOrder(input: CreateOrderInput) {
  const tenant = await Tenant.findById(input.tenantId);
  if (!tenant) throw new NotFoundError('Tenant');

  const customer = await getOrCreateCustomer(input.tenantId, input.customerPhone, input.customerName);

  const orderItems: IOrderItem[] = [];
  let subtotal = 0;

  for (const { menuItemId, qty } of input.items) {
    const item = await MenuItem.findOne({ _id: menuItemId, tenantId: input.tenantId });
    if (!item) throw new NotFoundError(`MenuItem ${menuItemId}`);
    if (!item.isAvailable) throw new ValidationError(`${item.name} is not available`);
    orderItems.push({
      menuItemId: item._id,
      nameSnapshot: item.name,
      priceSnapshot: item.price,
      qty,
    });
    subtotal += item.price * qty;
  }

  const taxRate = tenant.taxRatePercent / 100;
  const taxes = Math.round(subtotal * taxRate);
  const total = subtotal + taxes;
  const orderNumber = await nextOrderNumber(input.tenantId);

  const order = await Order.create({
    tenantId: input.tenantId,
    orderNumber,
    customerId: customer._id,
    items: orderItems,
    subtotal,
    taxes,
    total,
    status: 'pending',
    paymentMethod: input.paymentMethod,
    paymentStatus: 'unpaid',
    source: input.source,
    notes: input.notes,
    statusTransitions: [{ from: null, to: 'pending', at: new Date() }],
  });

  await Customer.findByIdAndUpdate(customer._id, {
    $inc: { totalOrders: 1 },
    lastOrderAt: new Date(),
  });

  await order.populate('customerId', 'name phone');
  return order;
}

export async function getOrders(
  tenantId: Types.ObjectId,
  opts: {
    status?: OrderStatus;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    page?: number;
    limit?: number;
  }
) {
  const query: Record<string, unknown> = { tenantId };
  if (opts.status) query.status = opts.status;
  if (opts.dateFrom || opts.dateTo) {
    const dateQuery: Record<string, Date> = {};
    if (opts.dateFrom) dateQuery.$gte = new Date(opts.dateFrom);
    if (opts.dateTo) dateQuery.$lte = new Date(opts.dateTo);
    query.createdAt = dateQuery;
  }
  if (opts.search) {
    query.$or = [{ orderNumber: { $regex: opts.search, $options: 'i' } }];
  }

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customerId', 'name phone'),
    Order.countDocuments(query),
  ]);

  return { orders, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getOrder(tenantId: Types.ObjectId, id: string) {
  const order = await Order.findOne({ _id: id, tenantId }).populate('customerId', 'name phone');
  if (!order) throw new NotFoundError('Order');
  return order;
}

export async function advanceStatus(tenantId: Types.ObjectId, id: string, newStatus: OrderStatus, reason?: string) {
  const order = await Order.findOne({ _id: id, tenantId });
  if (!order) throw new NotFoundError('Order');

  const allowed = ORDER_TRANSITIONS[order.status];
  if (!allowed.includes(newStatus)) {
    throw new ConflictError(
      `Cannot transition from '${order.status}' to '${newStatus}'. Allowed: ${allowed.join(', ') || 'none'}`
    );
  }

  const prevStatus = order.status;
  order.status = newStatus;
  if (newStatus === 'cancelled') order.cancelReason = reason;
  order.statusTransitions.push({ from: prevStatus, to: newStatus, at: new Date() });

  await order.save();
  await order.populate('customerId', 'name phone');
  return order;
}

export async function cancelOrder(tenantId: Types.ObjectId, id: string, reason: string) {
  return advanceStatus(tenantId, id, 'cancelled', reason);
}

export async function markOrderPaid(tenantId: Types.ObjectId, orderId: string, paymentRef: string) {
  const order = await Order.findOne({ _id: orderId, tenantId });
  if (!order) throw new NotFoundError('Order');
  order.paymentStatus = 'paid';
  order.paymentRef = paymentRef;
  if (order.status === 'pending') {
    order.status = 'confirmed';
    order.statusTransitions.push({ from: 'pending', to: 'confirmed', at: new Date() });
  }
  await order.save();
  await order.populate('customerId', 'name phone');
  return order;
}
