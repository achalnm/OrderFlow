import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, requireRole } from '../middleware/auth';
import * as analyticsService from '../services/analyticsService';
import { Types } from 'mongoose';

const router = Router();
router.use(requireAuth);
router.use(requireRole('owner', 'manager'));

router.get(
  '/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const { range = 'today' } = z
      .object({ range: z.enum(['today', '7d', '30d']).optional() })
      .parse(req.query);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const result = await analyticsService.getSummary(tenantId, range ?? 'today');

    res.json({
      stats: {
        revenue: result.revenue,
        orders: result.orderCount,
        aov: result.aov,
        pendingOrders: result.pendingCount,
      },
      dailyRevenue: (result.dailyRevenue as { _id: string; revenue: number }[]).map((d) => ({
        date: d._id,
        revenue: d.revenue,
      })),
      hourlyOrders: (result.ordersByHour as number[]).map((count, hour) => ({
        hour,
        orders: count,
      })),
      topItems: (result.topItems as { name: string; qty: number; revenue: number }[]).map((i) => ({
        name: i.name,
        count: i.qty,
        revenue: i.revenue,
      })),
      statusBreakdown: Object.entries(result.statusBreakdown as Record<string, number>).map(
        ([status, count]) => ({ status, count })
      ),
    });
  })
);

export default router;
