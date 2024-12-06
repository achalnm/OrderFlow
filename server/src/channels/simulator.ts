import { Router, Request, Response } from 'express';
import { MessagingChannel, formatReplyText } from './index';
import { handleIncoming } from '../bot/engine';
import { asyncHandler } from '../middleware/auth';
import { getSocketServer } from '../socket';
import { Tenant } from '../models/Tenant';
import { logger } from '../logger';

export class SimulatorChannel implements MessagingChannel {
  private handlers: Array<(tenantId: string, phone: string, text: string) => Promise<void>> = [];

  async sendMessage(phone: string, reply: { text: string; options?: string[] }): Promise<void> {
    const io = getSocketServer();
    if (!io) return;
    const text = formatReplyText(reply);
    io.of('/simulator').to(`sim:${phone}`).emit('bot:reply', { replies: [{ text, options: reply.options }] });
  }

  onIncoming(handler: (tenantId: string, phone: string, text: string) => Promise<void>): void {
    this.handlers.push(handler);
  }

  async handleMessage(tenantId: string, phone: string, text: string): Promise<void> {
    for (const h of this.handlers) {
      await h(tenantId, phone, text);
    }
  }
}

export const simulatorChannel = new SimulatorChannel();

export function createSimulatorRouter(): Router {
  const router = Router();

  router.post(
    '/:tenantSlug/message',
    asyncHandler(async (req: Request, res: Response) => {
      const { tenantSlug } = req.params;
      const { phone, text } = req.body as { phone: string; text: string };

      const tenant = await Tenant.findOne({ slug: tenantSlug });
      if (!tenant) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
        return;
      }

      const replies = await handleIncoming({ tenantId: tenant._id.toString(), customerPhone: phone, text });

      const io = getSocketServer();
      if (io) {
        io.of('/simulator').to(`sim:${tenantSlug}`).emit('bot:reply', {
          replies: replies.map((r) => ({ text: formatReplyText(r), options: r.options })),
        });
      }

      res.json({ replies });
    })
  );

  router.post(
    '/:tenantSlug/simulate-payment',
    asyncHandler(async (req: Request, res: Response) => {
      const { orderId, status } = req.body as { orderId: string; status: 'paid' | 'failed' };
      const baseUrl = process.env.BASE_URL ?? 'http://localhost:4000';
      const response = await fetch(`${baseUrl}/api/webhooks/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status, eventId: `sim_${Date.now()}` }),
      });
      const data = await response.json();
      res.json(data);
    })
  );

  return router;
}
