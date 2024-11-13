import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth } from '../middleware/auth';
import * as authService from '../services/authService';

const router = Router();

const registerSchema = z.object({
  tenantName: z.string().min(2).max(100),
  ownerName: z.string().min(1).max(100),
  ownerEmail: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

router.post(
  '/register-tenant',
  asyncHandler(async (req: Request, res: Response) => {
    const data = registerSchema.parse(req.body);
    const result = await authService.registerTenant(data);
    res.status(201).json({
      tenant: { id: result.tenant._id, name: result.tenant.name, slug: result.tenant.slug },
      user: { id: result.user._id, name: result.user.name, email: result.user.email, role: result.user.role },
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, tenantSlug } = loginSchema.parse(req.body);
    const result = await authService.login(email, password, tenantSlug);
    await result.user.populate('tenantId');
    const tenant = result.user.tenantId as unknown as { _id: { toString: () => string }; name: string; slug: string };
    res.json({
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        tenantId: tenant._id.toString(),
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
      },
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refreshTokens(refreshToken);
    res.json(result);
  })
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    await authService.logout(req.user!.userId);
    res.json({ success: true });
  })
);

export default router;
