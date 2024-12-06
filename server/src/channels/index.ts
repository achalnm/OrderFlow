import { logger } from '../logger';

export interface MessagingChannel {
  sendMessage(phone: string, reply: { text: string; options?: string[] }): Promise<void>;
  onIncoming(handler: (tenantId: string, phone: string, text: string) => Promise<void>): void;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

export function formatReplyText(reply: { text: string; options?: string[] }): string {
  if (!reply.options || reply.options.length === 0) return reply.text;
  const opts = reply.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
  return reply.text ? `${reply.text}\n\n${opts}` : opts;
}

let _channel: MessagingChannel;

export function getChannelAdapter(): MessagingChannel {
  if (!_channel) {
    _channel = new NullChannel();
  }
  return _channel;
}

export function setChannelAdapter(channel: MessagingChannel): void {
  _channel = channel;
}

class NullChannel implements MessagingChannel {
  async sendMessage(_phone: string, _reply: { text: string; options?: string[] }): Promise<void> {}
  onIncoming(_handler: (tenantId: string, phone: string, text: string) => Promise<void>): void {}
}
