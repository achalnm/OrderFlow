import mongoose, { Document, Schema, Types } from 'mongoose';

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type PaymentMethod = 'cod' | 'online';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
export type OrderSource = 'whatsapp' | 'dashboard';

export interface IOrderItem {
  menuItemId: Types.ObjectId;
  nameSnapshot: string;
  priceSnapshot: number; // paise
  qty: number;
}

export interface IStatusTransition {
  from: OrderStatus | null;
  to: OrderStatus;
  at: Date;
}

export interface IOrder extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  orderNumber: string; // e.g. ORD-0042
  customerId: Types.ObjectId;
  items: IOrderItem[];
  subtotal: number; // paise
  taxes: number; // paise
  total: number; // paise
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentRef?: string;
  source: OrderSource;
  cancelReason?: string;
  statusTransitions: IStatusTransition[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    nameSnapshot: { type: String, required: true },
    priceSnapshot: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const statusTransitionSchema = new Schema<IStatusTransition>(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    orderNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    taxes: { type: Number, required: true },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'],
      default: 'pending',
    },
    paymentMethod: { type: String, enum: ['cod', 'online'], required: true },
    paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
    paymentRef: String,
    source: { type: String, enum: ['whatsapp', 'dashboard'], default: 'dashboard' },
    cancelReason: String,
    statusTransitions: [statusTransitionSchema],
    notes: String,
  },
  { timestamps: true }
);

orderSchema.index({ tenantId: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, status: 1 });
orderSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });

export const Order = mongoose.model<IOrder>('Order', orderSchema);

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['completed'],
  completed: [],
  cancelled: [],
};
