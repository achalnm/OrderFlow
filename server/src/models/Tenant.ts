import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITenant extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  plan: 'free' | 'pro';
  whatsappNumber: string;
  taxRatePercent: number;
  printerConfig: {
    type: 'mock' | 'network' | 'usb';
    host?: string;
    port?: number;
  };
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    whatsappNumber: { type: String, default: '' },
    taxRatePercent: { type: Number, default: 5, min: 0, max: 100 },
    printerConfig: {
      type: { type: String, enum: ['mock', 'network', 'usb'], default: 'mock' },
      host: String,
      port: Number,
    },
    razorpayKeyId: String,
    razorpayKeySecret: String,
  },
  { timestamps: true }
);

tenantSchema.index({ slug: 1 }, { unique: true });

export const Tenant = mongoose.model<ITenant>('Tenant', tenantSchema);
