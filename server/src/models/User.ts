import mongoose, { Document, Schema, Types } from 'mongoose';

export type UserRole = 'owner' | 'manager' | 'staff';

export interface IUser extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  refreshTokenHash?: string;
  refreshJti?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['owner', 'manager', 'staff'], default: 'staff' },
    isActive: { type: Boolean, default: true },
    refreshTokenHash: String,
    refreshJti: String,
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const User = mongoose.model<IUser>('User', userSchema);
