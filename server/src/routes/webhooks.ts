import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/auth';
import { getPaymentProvider } from '../payments';
import * as orderService from '../services/orderService';
import { WebhookEventLog } from '../models/WebhookEventLog';
import { Order } from '../models/Order';
import { getSocketServer } from '../socket';
import { getPrinterService } from '../printer';
import { getChannelAdapter } from '../channels';
import { ConversationSession } from '../models/ConversationSession';
import { serializeOrder } from '../utils/serializeOrder';
import { logger } from '../logger';

const router = Router();

router.post(
  '/mock',
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId, status, eventId } = req.body as {
      orderId: string;
      status: 'paid' | 'failed';
      eventId: string;
    };

    const order = await Order.findById(orderId);
    if (!order) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
      return;
    }

    const existing = await WebhookEventLog.findOne({
      tenantId: order.tenantId,
      type: 'mock.payment',
      eventId,
    });
    if (existing) {
      res.json({ duplicate: true });
      return;
    }
    await WebhookEventLog.create({
      tenantId: order.tenantId,
      type: 'mock.payment',
      eventId,
      payload: req.body,
    });

    if (status === 'paid') {
      const updated = await orderService.markOrderPaid(order.tenantId, orderId, `mock_${eventId}`);
      const io = getSocketServer();
      if (io) {
        io.to(`tenant:${order.tenantId}`).emit('order:updated', serializeOrder(updated));
        io.to(`tenant:${order.tenantId}`).emit('payment:received', { orderId, orderNumber: updated.orderNumber });
      }

      try {
        const session = await ConversationSession.findOne({
          tenantId: order.tenantId,
          'context.pendingOrderId': orderId,
        });
        if (session) {
          const channel = getChannelAdapter();
          await channel.sendMessage(session.customerPhone, {
            text: `Payment received for order *${updated.orderNumber}*. We are preparing your order now.`,
          });
          session.state = 'CONFIRMED';
          await session.save();
        }
      } catch (err) {
        logger.error({ err }, 'Failed to notify customer after payment');
      }

      try {
        await getPrinterService().printReceipt(updated, order.tenantId.toString());
      } catch {}

      res.json({ success: true, orderNumber: updated.orderNumber });
    } else {
      res.json({ success: false, status: 'payment_failed' });
    }
  })
);

router.post(
  '/razorpay',
  asyncHandler(async (req: Request, res: Response) => {
    const provider = getPaymentProvider();
    let result;
    try {
      result = provider.verifyWebhook(req.body, req.headers as Record<string, string>);
    } catch (err) {
      res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' } });
      return;
    }

    const order = await Order.findById(result.orderRef);
    if (!order) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
      return;
    }

    const existing = await WebhookEventLog.findOne({
      tenantId: order.tenantId,
      type: 'razorpay.payment',
      eventId: result.eventId,
    });
    if (existing) {
      res.json({ duplicate: true });
      return;
    }
    await WebhookEventLog.create({
      tenantId: order.tenantId,
      type: 'razorpay.payment',
      eventId: result.eventId,
      payload: req.body,
    });

    if (result.status === 'paid') {
      const updated = await orderService.markOrderPaid(order.tenantId, result.orderRef, result.eventId);
      const io = getSocketServer();
      if (io) {
        io.to(`tenant:${order.tenantId}`).emit('order:updated', serializeOrder(updated));
        io.to(`tenant:${order.tenantId}`).emit('payment:received', { orderId: result.orderRef });
      }
    }

    res.json({ received: true });
  })
);

router.get('/pay-page/:orderId', async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId).populate('customerId', 'phone name');
  if (!order) {
    res.status(404).send('Order not found');
    return;
  }
  const paise = (v: number) => `₹${(v / 100).toFixed(2)}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pay for ${order.orderNumber}</title>
<style>
  body { font-family: sans-serif; max-width: 400px; margin: 40px auto; padding: 20px; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 24px; }
  h2 { color: #1a1a1a; }
  .amount { font-size: 2rem; font-weight: bold; color: #128C7E; }
  .btn { display: block; width: 100%; padding: 14px; border: none; border-radius: 6px;
         font-size: 1rem; cursor: pointer; margin-top: 12px; }
  .btn-pay { background: #128C7E; color: white; }
  .btn-fail { background: #e53e3e; color: white; }
  .result { margin-top: 16px; padding: 12px; border-radius: 6px; display: none; }
  .result.success { background: #c6f6d5; color: #276749; }
  .result.error { background: #fed7d7; color: #c53030; }
</style>
</head>
<body>
<div class="card">
  <h2>Order Payment</h2>
  <p>Order: <strong>${order.orderNumber}</strong></p>
  <p class="amount">${paise(order.total)}</p>
  <p>Items: ${order.items.map((i) => `${i.qty}x ${i.nameSnapshot}`).join(', ')}</p>
  <button class="btn btn-pay" onclick="pay('paid')">Pay Now (Test)</button>
  <button class="btn btn-fail" onclick="pay('failed')">Fail Payment</button>
  <div id="result" class="result"></div>
</div>
<script>
async function pay(status) {
  const r = document.getElementById('result');
  try {
    const resp = await fetch('/api/webhooks/mock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: '${orderId}', status, eventId: 'mockpay_' + Date.now() })
    });
    const data = await resp.json();
    if (data.success) {
      r.className = 'result success';
      r.style.display = 'block';
      r.textContent = 'Payment successful. Order ' + data.orderNumber + ' is confirmed.';
    } else {
      r.className = 'result error';
      r.style.display = 'block';
      r.textContent = 'Payment failed.';
    }
  } catch(e) {
    r.className = 'result error';
    r.style.display = 'block';
    r.textContent = 'Error: ' + e.message;
  }
}
</script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

export default router;
