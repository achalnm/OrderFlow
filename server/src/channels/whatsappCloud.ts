import { Router, Request, Response } from 'express';
import { MessagingChannel, formatReplyText } from './index';
import { logger } from '../logger';

export class WhatsAppCloudChannel implements MessagingChannel {
  private handlers: Array<(tenantId: string, phone: string, text: string) => Promise<void>> = [];
  private tenantId: string;
  private token: string;
  private phoneNumberId: string;
  private verifyToken: string;

  constructor(tenantId: string, token: string, phoneNumberId: string, verifyToken: string) {
    this.tenantId = tenantId;
    this.token = token;
    this.phoneNumberId = phoneNumberId;
    this.verifyToken = verifyToken;
  }

  async sendMessage(phone: string, reply: { text: string; options?: string[] }): Promise<void> {
    const text = formatReplyText(reply);
    const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: text },
    };
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) logger.error({ status: resp.status }, 'WhatsApp Cloud API error');
    } catch (err) {
      logger.error({ err }, 'WhatsApp Cloud sendMessage error');
    }
  }

  onIncoming(handler: (tenantId: string, phone: string, text: string) => Promise<void>): void {
    this.handlers.push(handler);
  }

  createWebhookRouter(): Router {
    const router = Router();

    // Verify handshake
    router.get('/', (req: Request, res: Response) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === this.verifyToken) {
        res.status(200).send(challenge);
      } else {
        res.status(403).send('Forbidden');
      }
    });

    // Incoming messages
    router.post('/', async (req: Request, res: Response) => {
      const body = req.body as {
        entry?: Array<{
          changes?: Array<{
            value?: {
              messages?: Array<{ from: string; type: string; text?: { body: string } }>;
            };
          }>;
        }>;
      };
      res.sendStatus(200); // Acknowledge immediately
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const msg of change.value?.messages ?? []) {
            if (msg.type !== 'text' || !msg.text?.body) continue;
            const phone = msg.from;
            for (const h of this.handlers) {
              h(this.tenantId, phone, msg.text.body).catch((err) => {
                logger.error({ err }, 'WhatsApp Cloud handler error');
              });
            }
          }
        }
      }
    });

    return router;
  }
}
