import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IMenuCategory extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const menuCategorySchema = new Schema<IMenuCategory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

menuCategorySchema.index({ tenantId: 1, sortOrder: 1 });

export const MenuCategory = mongoose.model<IMenuCategory>('MenuCategory', menuCategorySchema);
