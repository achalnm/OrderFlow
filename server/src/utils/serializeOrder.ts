import { IOrder } from '../models/Order';
import { Types } from 'mongoose';
import { readFile } from 'fs/promises';
import { join } from 'path';

type PopulatedOrder = IOrder & {
  customerId?: { name?: string; phone?: string } | Types.ObjectId;
};

export function serializeOrder(order: PopulatedOrder) {
  const cust = order.customerId as { name?: string; phone?: string } | undefined;
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    customerName: cust?.name ?? 'Unknown',
    customerPhone: cust?.phone ?? '',
    items: order.items.map((item) => ({
      id: item.menuItemId.toString(),
      name: item.nameSnapshot,
      quantity: item.qty,
      price: item.priceSnapshot,
    })),
    subtotal: order.subtotal,
    tax: order.taxes,
    total: order.total,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    source: order.source,
    notes: order.notes,
    cancelReason: order.cancelReason,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export async function serializeOrderWithReceipt(order: PopulatedOrder) {
  let receiptText: string | undefined;
  try {
    const path = join(process.cwd(), 'printouts', `${order.orderNumber}.txt`);
    receiptText = await readFile(path, 'utf8');
  } catch {}
  return { ...serializeOrder(order), receiptText };
}
