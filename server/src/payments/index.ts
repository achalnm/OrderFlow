import { IOrder } from '../models/Order';
import { logger } from '../logger';

export interface PaymentLinkResult {
  url: string;
  providerRef: string;
}

export interface WebhookVerifyResult {
  orderRef: string;
  status: 'paid' | 'failed';
  eventId: string;
}

export interface PaymentProvider {
  createPaymentLink(order: IOrder): Promise<PaymentLinkResult>;
  verifyWebhook(body: Record<string, unknown>, headers: Record<string, string>): WebhookVerifyResult;
}

class MockPaymentProvider implements PaymentProvider {
  async createPaymentLink(order: IOrder): Promise<PaymentLinkResult> {
    const baseUrl = process.env.BASE_URL ?? 'http://localhost:4000';
    return {
      url: `${baseUrl}/pay/${order._id.toString()}`,
      providerRef: `mock_${order._id.toString()}`,
    };
  }

  verifyWebhook(body: Record<string, unknown>): WebhookVerifyResult {
    return {
      orderRef: body.orderId as string,
      status: body.status as 'paid' | 'failed',
      eventId: body.eventId as string,
    };
  }
}

class RazorpayProvider implements PaymentProvider {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(keyId: string, keySecret: string, webhookSecret: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
  }

  async createPaymentLink(order: IOrder): Promise<PaymentLinkResult> {
    const baseUrl = process.env.BASE_URL ?? 'http://localhost:4000';
    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: order.total,
        currency: 'INR',
        description: `Order ${order.orderNumber}`,
        callback_url: `${baseUrl}/api/webhooks/razorpay`,
        callback_method: 'get',
        reference_id: order._id.toString(),
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Razorpay error: ${err}`);
    }
    const data = (await response.json()) as { short_url: string; id: string };
    return { url: data.short_url, providerRef: data.id };
  }

  verifyWebhook(body: Record<string, unknown>, headers: Record<string, string>): WebhookVerifyResult {
    const crypto = require('crypto');
    const signature = headers['x-razorpay-signature'];
    const digest = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(body))
      .digest('hex');
    if (signature !== digest) throw new Error('Invalid Razorpay signature');

    const event = body as {
      id: string;
      event: string;
      payload: { payment_link: { entity: { reference_id: string } } };
    };
    const orderRef = event.payload.payment_link.entity.reference_id;
    const status = event.event === 'payment_link.paid' ? 'paid' : 'failed';
    return { orderRef, status, eventId: event.id };
  }
}

let _paymentProvider: PaymentProvider;

export function initPaymentProvider(): PaymentProvider {
  const type = process.env.PAYMENT_PROVIDER ?? 'mock';
  if (
    type === 'razorpay' &&
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_WEBHOOK_SECRET
  ) {
    _paymentProvider = new RazorpayProvider(
      process.env.RAZORPAY_KEY_ID,
      process.env.RAZORPAY_KEY_SECRET,
      process.env.RAZORPAY_WEBHOOK_SECRET
    );
    logger.info('Razorpay payment provider initialized');
  } else {
    _paymentProvider = new MockPaymentProvider();
    logger.info('Mock payment provider initialized');
  }
  return _paymentProvider;
}

export function getPaymentProvider(): PaymentProvider {
  if (!_paymentProvider) _paymentProvider = new MockPaymentProvider();
  return _paymentProvider;
}
