import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { deleteSetting, getAiProvider, getGeminiApiKey, getOllamaBaseUrl, getOllamaModel, setSetting } from '../services/appSettings.js';
import { checkOllamaStatus } from '../services/ollama.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/gemini-key',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    if (authed.user?.role === 'student') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    res.json({ hasKey: !!getGeminiApiKey() });
  })
);

const setKeySchema = z.object({ apiKey: z.string().min(20).max(200).regex(/^[\w-]+$/, 'API key không đúng định dạng') });

router.put(
  '/gemini-key',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const parsed = setKeySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'API key không hợp lệ');
    setSetting('gemini_api_key', parsed.data.apiKey);
    res.json({ hasKey: true });
  })
);

router.delete(
  '/gemini-key',
  requireRole('teacher', 'admin'),
  h(async (_req, res) => {
    deleteSetting('gemini_api_key');
    res.json({ hasKey: false });
  })
);

router.get(
  '/ai-provider',
  h(async (req, res) => {
    const authed = req as AuthedRequest;
    if (authed.user?.role === 'student') throw new HttpError(403, 'FORBIDDEN', 'Không có quyền');
    res.json({ provider: getAiProvider(), ollamaBaseUrl: getOllamaBaseUrl(), ollamaModel: getOllamaModel() });
  })
);

const providerSchema = z.object({
  provider: z.enum(['cloud', 'local', 'auto']),
  ollamaBaseUrl: z.string().url().max(200).optional(),
  ollamaModel: z.string().min(1).max(100).regex(/^[\w.:\-/]+$/).optional(),
});

router.put(
  '/ai-provider',
  requireRole('teacher', 'admin'),
  h(async (req, res) => {
    const parsed = providerSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Cấu hình AI không hợp lệ');
    setSetting('ai_provider', parsed.data.provider);
    if (parsed.data.ollamaBaseUrl) setSetting('ollama_base_url', parsed.data.ollamaBaseUrl);
    if (parsed.data.ollamaModel) setSetting('ollama_model', parsed.data.ollamaModel);
    res.json({ ok: true });
  })
);

router.get(
  '/ollama-status',
  requireRole('teacher', 'admin'),
  h(async (_req, res) => {
    res.json(await checkOllamaStatus());
  })
);

export default router;
