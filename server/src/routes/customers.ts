import { Router, Request, Response } from 'express';
import { asyncHandler, requireAuth } from '../middleware/auth';
import { Customer } from '../models/Customer';
import { Order } from '../models/Order';
import { Types } from 'mongoose';
import { NotFoundError } from '../utils/errors';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const { search, page = '1', limit = '50' } = req.query;
    const query: Record<string, unknown> = { tenantId };
    if (search) {
      query.$or = [
        { phone: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [customers, total] = await Promise.all([
      Customer.find(query)
        .sort({ lastOrderAt: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Customer.countDocuments(query),
    ]);
    res.json(customers.map((c) => ({
      id: c._id,
      phone: c.phone,
      name: c.name,
      totalOrders: c.totalOrders,
      lastOrderAt: c.lastOrderAt ?? null,
    })));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const customer = await Customer.findOne({ _id: req.params.id, tenantId });
    if (!customer) throw new NotFoundError('Customer');
    const orders = await Order.find({ tenantId, customerId: customer._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const totalSpent = orders
      .filter((o) => o.status === 'completed' || o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + o.total, 0);

    res.json({
      id: customer._id,
      phone: customer.phone,
      name: customer.name,
      totalOrders: customer.totalOrders,
      totalSpent,
      lastOrderAt: customer.lastOrderAt ?? null,
      orders: orders.map((o) => ({
        id: o._id,
        orderNumber: `ORD-${String(o.orderNumber).padStart(4, '0')}`,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt,
        items: o.items.map((item) => ({
          name: item.nameSnapshot,
          quantity: item.qty,
          price: item.priceSnapshot,
        })),
      })),
    });
  })
);

export default router;
