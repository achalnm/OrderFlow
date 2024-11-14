import mongoose, { Schema, Types } from 'mongoose';

interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model<ICounter>('Counter', counterSchema);

export async function nextOrderNumber(tenantId: Types.ObjectId): Promise<string> {
  const key = `order:${tenantId.toString()}`;
  const doc = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = doc!.seq.toString().padStart(4, '0');
  return `ORD-${seq}`;
}
