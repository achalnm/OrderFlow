import { MessagingChannel, formatReplyText } from './index';
import { logger } from '../logger';

export class WhatsAppWebJsChannel implements MessagingChannel {
  private client: unknown = null;
  private handlers: Array<(tenantId: string, phone: string, text: string) => Promise<void>> = [];
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async start(): Promise<void> {
    try {
      const { Client, LocalAuth } = await import('whatsapp-web.js');

      const client = new Client({ authStrategy: new LocalAuth() });

      client.on('qr', (qr: string) => {
        logger.info('WhatsApp QR code generated, scan with your phone:');
        // Print QR to terminal
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        try { const qrcode = require('qrcode-terminal') as { generate: (qr: string, opts: { small: boolean }) => void }; qrcode.generate(qr, { small: true }); }
        catch { logger.info({ qr }, 'QR fallback'); }
      });

      client.on('ready', () => {
        logger.info('WhatsApp Web client ready');
      });

      client.on('message', async (msg: { from: string; body: string; isGroupMsg: boolean }) => {
        if (msg.isGroupMsg) return;
        const phone = msg.from.replace('@c.us', '');
        for (const h of this.handlers) {
          await h(this.tenantId, phone, msg.body).catch((err) => {
            logger.error({ err }, 'WhatsAppWebJs handler error');
          });
        }
      });

      await client.initialize();
      this.client = client;
    } catch (err) {
      logger.error({ err }, 'WhatsAppWebJs failed to start, channel disabled');
    }
  }

  async sendMessage(phone: string, reply: { text: string; options?: string[] }): Promise<void> {
    if (!this.client) return;
    const text = formatReplyText(reply);
    try {
      const c = this.client as { sendMessage: (to: string, text: string) => Promise<void> };
      await c.sendMessage(`${phone}@c.us`, text);
    } catch (err) {
      logger.error({ err }, 'WhatsAppWebJs sendMessage error');
    }
  }

  onIncoming(handler: (tenantId: string, phone: string, text: string) => Promise<void>): void {
    this.handlers.push(handler);
  }

  async stop(): Promise<void> {
    if (this.client) {
      const c = this.client as { destroy: () => Promise<void> };
      await c.destroy().catch(() => {});
    }
  }
}
