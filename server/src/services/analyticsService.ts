import { Types } from 'mongoose';
import { Order } from '../models/Order';

type Range = 'today' | '7d' | '30d';

function getDateRange(range: Range): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  if (range === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (range === '7d') {
    from.setDate(from.getDate() - 7);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - 30);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

export async function getSummary(tenantId: Types.ObjectId, range: Range) {
  const { from, to } = getDateRange(range);
  const matchStage = {
    tenantId,
    createdAt: { $gte: from, $lte: to },
    status: { $nin: ['cancelled'] },
  };

  const [summary] = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$total' },
        orderCount: { $sum: 1 },
        totalValue: { $sum: '$total' },
      },
    },
  ]);

  const revenue = summary?.revenue ?? 0;
  const orderCount = summary?.orderCount ?? 0;
  const aov = orderCount > 0 ? Math.round(revenue / orderCount) : 0;

  const hourlyAgg = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { $hour: '$createdAt' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const ordersByHour: number[] = Array(24).fill(0);
  for (const { _id, count } of hourlyAgg) {
    ordersByHour[_id] = count;
  }

  const topItems = await Order.aggregate([
    { $match: matchStage },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.nameSnapshot',
        qty: { $sum: '$items.qty' },
        revenue: { $sum: { $multiply: ['$items.priceSnapshot', '$items.qty'] } },
      },
    },
    { $sort: { qty: -1 } },
    { $limit: 10 },
    { $project: { name: '$_id', qty: 1, revenue: 1, _id: 0 } },
  ]);

  const statusAgg = await Order.aggregate([
    { $match: { tenantId, createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const statusBreakdown: Record<string, number> = {};
  for (const { _id, count } of statusAgg) {
    statusBreakdown[_id] = count;
  }

  const dailyAgg = await Order.aggregate([
    {
      $match: {
        tenantId,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { $nin: ['cancelled'] },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        revenue: { $sum: '$total' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const pendingCount = await Order.countDocuments({ tenantId, status: 'pending' });

  return {
    range,
    from,
    to,
    revenue,
    orderCount,
    aov,
    pendingCount,
    ordersByHour,
    topItems,
    statusBreakdown,
    dailyRevenue: dailyAgg,
  };
}
