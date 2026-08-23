import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { deleteSetting, getGeminiApiKey, setSetting } from '../services/appSettings.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/settings/gemini-key',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    if (authed.user?.role === 'student') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    res.json({ hasKey: !!getGeminiApiKey() });
  })
);

const setKeySchema = z.object({ apiKey: z.string().min(20).max(200).regex(/^[\w-]+$/, 'API key không đúng định dạng') });

router.put(
  '/settings/gemini-key',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const parsed = setKeySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'API key không hợp lệ');
    setSetting('gemini_api_key', parsed.data.apiKey);
    res.json({ hasKey: true });
  })
);

router.delete(
  '/settings/gemini-key',
  requireRole('teacher', 'admin'),
  h(async (_req, res) => {
    deleteSetting('gemini_api_key');
    res.json({ hasKey: false });
  })
);

export default router;
