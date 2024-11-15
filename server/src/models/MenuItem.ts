import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IMenuItem extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  description: string;
  price: number; // integer paise
  imageUrl?: string;
  isAvailable: boolean;
  tags: string[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const menuItemSchema = new Schema<IMenuItem>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'MenuCategory', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    imageUrl: String,
    isAvailable: { type: Boolean, default: true },
    tags: [{ type: String }],
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

menuItemSchema.index({ tenantId: 1, categoryId: 1, sortOrder: 1 });
menuItemSchema.index({ tenantId: 1, name: 'text' });

export const MenuItem = mongoose.model<IMenuItem>('MenuItem', menuItemSchema);
