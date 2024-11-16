import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, requireRole } from '../middleware/auth';
import * as menuService from '../services/menuService';
import { Types } from 'mongoose';

const router = Router();
router.use(requireAuth);

function serializeCat(c: { _id: unknown; name: string; isActive: boolean; sortOrder: number }) {
  return { id: (c._id as { toString(): string }).toString(), name: c.name, isActive: c.isActive, sortOrder: c.sortOrder };
}

function serializeItem(i: {
  _id: unknown; name: string; description: string; price: number;
  tags: string[]; isAvailable: boolean; categoryId: unknown;
}) {
  const catField = i.categoryId as { _id?: unknown; toString(): string } | null;
  const categoryId = catField?._id
    ? (catField._id as { toString(): string }).toString()
    : (catField?.toString() ?? '');
  return {
    id: (i._id as { toString(): string }).toString(),
    name: i.name,
    description: i.description,
    price: i.price,
    tags: i.tags,
    isAvailable: i.isAvailable,
    categoryId,
  };
}

const categorySchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().optional(),
});

const itemSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  price: z.number().int().positive(), // paise
  imageUrl: z.string().url().optional(),
  isAvailable: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  sortOrder: z.number().optional(),
});

router.get(
  '/categories',
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const cats = await menuService.listCategories(tenantId);
    res.json(cats.map(serializeCat));
  })
);

router.post(
  '/categories',
  requireRole('owner', 'manager'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = categorySchema.parse(req.body);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    res.status(201).json(serializeCat(await menuService.createCategory(tenantId, data)));
  })
);

router.patch(
  '/categories/reorder',
  requireRole('owner', 'manager'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { order?: { id: string }[]; orderedIds?: string[] };
    const orderedIds = body.order ? body.order.map((o) => o.id) : (body.orderedIds ?? []);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    await menuService.reorderCategories(tenantId, orderedIds);
    res.json({ success: true });
  })
);

router.patch(
  '/categories/:id',
  requireRole('owner', 'manager'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const data = categorySchema.partial().parse(req.body);
    res.json(serializeCat(await menuService.updateCategory(tenantId, req.params.id, data)));
  })
);

router.delete(
  '/categories/:id',
  requireRole('owner', 'manager'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    await menuService.deleteCategory(tenantId, req.params.id);
    res.json({ success: true });
  })
);

router.get(
  '/items',
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const { categoryId } = req.query;
    const items = await menuService.listItems(tenantId, categoryId as string);
    res.json(items.map(serializeItem));
  })
);

router.post(
  '/items',
  requireRole('owner', 'manager'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = itemSchema.parse(req.body);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    res.status(201).json(serializeItem(await menuService.createItem(tenantId, data)));
  })
);

router.patch(
  '/items/:id',
  requireRole('owner', 'manager'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = itemSchema.partial().parse(req.body);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    res.json(serializeItem(await menuService.updateItem(tenantId, req.params.id, data)));
  })
);

router.patch(
  '/items/:id/availability',
  requireRole('owner', 'manager', 'staff'),
  asyncHandler(async (req: Request, res: Response) => {
    const { isAvailable } = z.object({ isAvailable: z.boolean() }).parse(req.body);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    res.json(serializeItem(await menuService.setAvailability(tenantId, req.params.id, isAvailable)));
  })
);

router.delete(
  '/items/:id',
  requireRole('owner', 'manager'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    await menuService.deleteItem(tenantId, req.params.id);
    res.json({ success: true });
  })
);

router.post(
  '/items/reorder',
  requireRole('owner', 'manager'),
  asyncHandler(async (req: Request, res: Response) => {
    const { orderedIds } = z.object({ orderedIds: z.array(z.string()) }).parse(req.body);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    await menuService.reorderItems(tenantId, orderedIds);
    res.json({ success: true });
  })
);

export default router;
