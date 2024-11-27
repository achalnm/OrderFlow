import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, requireRole } from '../middleware/auth';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { Types } from 'mongoose';
import { NotFoundError } from '../utils/errors';
import * as authService from '../services/authService';

const router = Router();
router.use(requireAuth);

router.get(
  '/tenant',
  asyncHandler(async (req: Request, res: Response) => {
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) throw new NotFoundError('Tenant');
    res.json({
      tenantName: tenant.name,
      whatsappNumber: tenant.whatsappNumber,
      taxRate: tenant.taxRatePercent,
    });
  })
);

router.patch(
  '/tenant',
  requireRole('owner', 'manager'),
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      tenantName: z.string().min(1).optional(),
      whatsappNumber: z.string().optional(),
      taxRate: z.number().min(0).max(100).optional(),
    });
    const data = schema.parse(req.body);
    const update: Record<string, unknown> = {};
    if (data.tenantName !== undefined) update.name = data.tenantName;
    if (data.whatsappNumber !== undefined) update.whatsappNumber = data.whatsappNumber;
    if (data.taxRate !== undefined) update.taxRatePercent = data.taxRate;
    const tenant = await Tenant.findByIdAndUpdate(req.user!.tenantId, { $set: update }, { new: true });
    if (!tenant) throw new NotFoundError('Tenant');
    res.json({ tenantName: tenant.name, whatsappNumber: tenant.whatsappNumber, taxRate: tenant.taxRatePercent });
  })
);

router.get(
  '/payment',
  asyncHandler(async (req: Request, res: Response) => {
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) throw new NotFoundError('Tenant');
    res.json({
      provider: tenant.razorpayKeyId ? 'razorpay' : 'mock',
      razorpayKeyId: tenant.razorpayKeyId ?? '',
      razorpayKeySecret: tenant.razorpayKeySecret ? '••••••••' : '',
    });
  })
);

router.patch(
  '/payment',
  requireRole('owner'),
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      provider: z.enum(['mock', 'razorpay']).optional(),
      razorpayKeyId: z.string().optional(),
      razorpayKeySecret: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const update: Record<string, unknown> = {};
    if (data.razorpayKeyId !== undefined) update.razorpayKeyId = data.razorpayKeyId;
    if (data.razorpayKeySecret && !data.razorpayKeySecret.startsWith('•')) {
      update.razorpayKeySecret = data.razorpayKeySecret;
    }
    if (data.provider === 'mock') {
      update.razorpayKeyId = '';
      update.razorpayKeySecret = '';
    }
    const tenant = await Tenant.findByIdAndUpdate(req.user!.tenantId, { $set: update }, { new: true });
    if (!tenant) throw new NotFoundError('Tenant');
    res.json({ success: true });
  })
);

router.get(
  '/printer',
  asyncHandler(async (req: Request, res: Response) => {
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) throw new NotFoundError('Tenant');
    res.json({
      type: tenant.printerConfig?.type ?? 'mock',
      host: tenant.printerConfig?.host ?? '',
      port: tenant.printerConfig?.port ?? 9100,
    });
  })
);

router.patch(
  '/printer',
  requireRole('owner'),
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      type: z.enum(['mock', 'network', 'usb']).optional(),
      host: z.string().optional(),
      port: z.number().int().min(1).max(65535).optional(),
    });
    const data = schema.parse(req.body);
    const tenant = await Tenant.findByIdAndUpdate(
      req.user!.tenantId,
      { $set: { 'printerConfig.type': data.type, 'printerConfig.host': data.host, 'printerConfig.port': data.port } },
      { new: true }
    );
    if (!tenant) throw new NotFoundError('Tenant');
    res.json({
      type: tenant.printerConfig?.type ?? 'mock',
      host: tenant.printerConfig?.host ?? '',
      port: tenant.printerConfig?.port ?? 9100,
    });
  })
);

router.get(
  '/users',
  requireRole('owner'),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const users = await User.find({ tenantId }, '-passwordHash -refreshTokenHash -refreshJti').sort({ createdAt: 1 });
    res.json(users.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
    })));
  })
);

router.post(
  '/users',
  requireRole('owner'),
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      role: z.enum(['manager', 'staff']),
      password: z.string().min(8),
    });
    const data = schema.parse(req.body);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const user = await authService.createUser({ ...data, tenantId });
    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });
  })
);

router.patch(
  '/users/:id',
  requireRole('owner'),
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      role: z.enum(['manager', 'staff']).optional(),
      isActive: z.boolean().optional(),
      name: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const tenantId = new Types.ObjectId(req.user!.tenantId);
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: data },
      { new: true, projection: '-passwordHash -refreshTokenHash -refreshJti' }
    );
    if (!user) throw new NotFoundError('User');
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });
  })
);

export default router;
