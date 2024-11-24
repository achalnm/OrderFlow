import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, requireRole } from '../middleware/auth';
import * as orderService from '../services/orderService';
import { OrderStatus } from '../models/Order';
import { Types } from 'mongoose';
import { getSocketServer } from '../socket';
import { getPrinterService } from '../printer';
import { serializeOrder, serializeOrderWithReceipt } from '../utils/serializeOrder';

const router = Router();
router.use(requireAuth);

const createOrderSchema = z.object({
  customerPhone: z.string(),
  customerName: z.string().optional(),
  items: z.array(
    z.object({ menuItemId: z.string(), qty: z.number().int().positive() })
  ),
  paymentMethod: z.enum(['cod', 'online']),
  notes: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']),
  reason: z.string().optional(),
});

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const { status, dateFrom, dateTo, search, page, limit, pageSize } = req.query;
    const result = await orderService.getOrders(tenantId, {
      status: status as OrderStatus,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      search: search as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : pageSize ? parseInt(pageSize as string) : 20,
    });
    res.json({
      orders: result.orders.map(serializeOrder),
      total: result.total,
      page: result.page,
      pages: result.pages,
    });
  })
);

router.post(
  '/',
  requireRole('owner', 'manager', 'staff'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = createOrderSchema.parse(req.body);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const order = await orderService.createOrder({ ...data, tenantId, source: 'dashboard' });

    const io = getSocketServer();
    if (io) {
      io.to(`tenant:${tenantId}`).emit('order:new', serializeOrder(order));
    }

    try {
      const printer = getPrinterService();
      await printer.printReceipt(order, tenantId.toString());
    } catch {}

    res.status(201).json(serializeOrder(order));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const order = await orderService.getOrder(tenantId, req.params.id);
    res.json(await serializeOrderWithReceipt(order));
  })
);

router.patch(
  '/:id/status',
  requireRole('owner', 'manager', 'staff'),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, reason } = statusSchema.parse(req.body);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const order = await orderService.advanceStatus(tenantId, req.params.id, status, reason);

    const io = getSocketServer();
    if (io) {
      io.to(`tenant:${tenantId}`).emit('order:updated', serializeOrder(order));
    }

    try {
      const statusMessages: Record<string, string> = {
        confirmed: `Your order ${order.orderNumber} has been confirmed.`,
        preparing: `Your order ${order.orderNumber} is now being prepared.`,
        ready: `Your order ${order.orderNumber} is ready.`,
        completed: `Order ${order.orderNumber} complete. Thank you.`,
        cancelled: `Order ${order.orderNumber} cancelled.${reason ? ' Reason: ' + reason : ''}`,
      };
      const msg = statusMessages[status];
      if (msg) {
        const cust = order.customerId as { phone?: string };
        if (cust?.phone) {
          const { getChannelAdapter } = await import('../channels');
          await getChannelAdapter().sendMessage(cust.phone, { text: msg });
        }
      }
    } catch {}

    if (status === 'completed') {
      try {
        const printer = getPrinterService();
        await printer.printReceipt(order, tenantId.toString());
      } catch {}
    }

    res.status(201).json(serializeOrder(order));
  })
);

router.post(
  '/:id/cancel',
  requireRole('owner', 'manager'),
  asyncHandler(async (req: Request, res: Response) => {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const order = await orderService.cancelOrder(tenantId, req.params.id, reason ?? '');

    const io = getSocketServer();
    if (io) {
      io.to(`tenant:${tenantId}`).emit('order:updated', serializeOrder(order));
    }

    res.status(201).json(serializeOrder(order));
  })
);

export default router;
