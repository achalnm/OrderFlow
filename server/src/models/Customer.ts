import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICustomer extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  phone: string; // E.164
  name?: string;
  totalOrders: number;
  lastOrderAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    phone: { type: String, required: true },
    name: String,
    totalOrders: { type: Number, default: 0 },
    lastOrderAt: Date,
  },
  { timestamps: true }
);

customerSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

export const Customer = mongoose.model<ICustomer>('Customer', customerSchema);
