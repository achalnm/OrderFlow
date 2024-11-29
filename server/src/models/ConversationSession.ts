import mongoose, { Document, Schema, Types } from 'mongoose';

export type BotState =
  | 'GREETING'
  | 'BROWSING_CATEGORIES'
  | 'BROWSING_ITEMS'
  | 'ITEM_QTY'
  | 'CART_REVIEW'
  | 'CHECKOUT_PAYMENT_CHOICE'
  | 'AWAITING_PAYMENT'
  | 'CONFIRMED';

export interface ICartItem {
  menuItemId: string;
  nameSnapshot: string;
  priceSnapshot: number;
  qty: number;
}

export interface ISessionContext {
  selectedCategoryId?: string;
  selectedCategoryName?: string;
  selectedItemId?: string;
  selectedItemName?: string;
  selectedItemPrice?: number;
  pendingOrderId?: string;
  paymentUrl?: string;
  fallbackCount?: number;
  lastItemsShown?: Array<{ id: string; name: string; price: number }>;
  lastCategoriesShown?: Array<{ id: string; name: string }>;
}

export interface IConversationSession extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  customerPhone: string;
  state: BotState;
  cart: ICartItem[];
  context: ISessionContext;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    menuItemId: { type: String, required: true },
    nameSnapshot: { type: String, required: true },
    priceSnapshot: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const conversationSessionSchema = new Schema<IConversationSession>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    customerPhone: { type: String, required: true },
    state: {
      type: String,
      enum: [
        'GREETING',
        'BROWSING_CATEGORIES',
        'BROWSING_ITEMS',
        'ITEM_QTY',
        'CART_REVIEW',
        'CHECKOUT_PAYMENT_CHOICE',
        'AWAITING_PAYMENT',
        'CONFIRMED',
      ],
      default: 'GREETING',
    },
    cart: [cartItemSchema],
    context: { type: Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

conversationSessionSchema.index({ tenantId: 1, customerPhone: 1 }, { unique: true });
conversationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ConversationSession = mongoose.model<IConversationSession>(
  'ConversationSession',
  conversationSessionSchema
);
