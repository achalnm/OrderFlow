import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IWebhookEventLog extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  type: string;
  eventId: string; // provider's event id for idempotency
  payload: Record<string, unknown>;
  processedAt: Date;
}

const webhookEventLogSchema = new Schema<IWebhookEventLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    type: { type: String, required: true },
    eventId: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

webhookEventLogSchema.index({ tenantId: 1, type: 1, eventId: 1 }, { unique: true });

export const WebhookEventLog = mongoose.model<IWebhookEventLog>(
  'WebhookEventLog',
  webhookEventLogSchema
);
