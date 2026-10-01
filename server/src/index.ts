import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { NETWORK_INTERFACES, PORT, TRUST_PROXY, WEB_DIST_DIR } from './config.js';
import { db, migrate } from './db/connection.js';
import { seedAdmin } from './db/seed.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import classesRoutes, { ensureAllDropFolders } from './routes/classes.routes.js';
import lecturesRoutes from './routes/lectures.routes.js';
import sharedCurriculumRoutes from './routes/sharedCurriculum.routes.js';
import materialIntakeRoutes from './routes/materialIntake.routes.js';
import questionsRoutes from './routes/questions.routes.js';
import examsRoutes from './routes/exams.routes.js';
import gamesRoutes from './routes/games.routes.js';
import gradesRoutes from './routes/grades.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import scheduleRoutes from './routes/schedule.routes.js';
import teachingPlansRoutes from './routes/teachingPlans.routes.js';
import curriculumDocumentsRoutes from './routes/curriculumDocuments.routes.js';
import lessonPlansRoutes from './routes/lessonPlans.routes.js';
import teachingLogsRoutes from './routes/teachingLogs.routes.js';
import sharedTeachingSessionsRoutes from './routes/sharedTeachingSessions.routes.js';
import preparedGamesRoutes from './routes/preparedGames.routes.js';
import mediaAuditRoutes from './routes/mediaAudit.routes.js';
import aiRoutes from './routes/ai.routes.js';
import ragRoutes from './routes/rag.routes.js';
import systemRoutes, { advertiseMdns, detectDocling, detectLibreOffice } from './routes/system.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import { initGameEngine, stopGameEngineTimers } from './realtime/gameRoom.js';
import { startBackupScheduler } from './services/backup.js';
import { stopTunnel } from './services/tunnel.js';
import { errorHandler } from './utils/errors.js';
import { requireSameHostCookieOrigin } from './middleware/csrf.js';
import { securityHeaders } from './middleware/securityHeaders.js';

migrate();
seedAdmin();
ensureAllDropFolders();

const app = express();
// Direct LAN remains untrusted. When enabled, only the configured immediate
// proxy addresses may supply X-Forwarded-For for req.ip and both rate limiters.
if (TRUST_PROXY !== false) app.set('trust proxy', TRUST_PROXY);
app.use(securityHeaders);
app.use(express.json({ limit: '4mb' }));
app.use('/api', requireSameHostCookieOrigin);
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu, thử lại sau một phút' } },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'SmartLecture', time: new Date().toISOString(), interfaces: NETWORK_INTERFACES, port: PORT });
});

app.use('/api/auth', authRoutes);
// lecturesRoutes must be mounted before any router with an unscoped router.use(requireAuth)
// (e.g. usersRoutes) — its /media/:materialId/stream route runs requireAuthFlexible ahead of
// its own blanket auth so <img>/<video>/<a> embeds can authenticate through the same-origin
// HttpOnly cookie. An earlier blanket requireAuth would otherwise intercept and
// 401 those requests before this route is ever reached, since Express runs a path-less
// router.use() for every request that enters that router, matching route or not.
app.use('/api', lecturesRoutes);
app.use('/api', sharedCurriculumRoutes);
app.use('/api', materialIntakeRoutes);
app.use('/api', usersRoutes);
app.use('/api', classesRoutes);
app.use('/api', questionsRoutes);
app.use('/api', examsRoutes);
app.use('/api', gamesRoutes);
app.use('/api', gradesRoutes);
app.use('/api', attendanceRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api', teachingPlansRoutes);
app.use('/api', curriculumDocumentsRoutes);
app.use('/api', lessonPlansRoutes);
app.use('/api', teachingLogsRoutes);
app.use('/api', sharedTeachingSessionsRoutes);
app.use('/api', preparedGamesRoutes);
app.use('/api/media-audit', mediaAuditRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/settings', settingsRoutes);

if (existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR));
  app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST_DIR, 'index.html'));
  });
}

void detectDocling();
void detectLibreOffice();
const mdns = advertiseMdns();
const stopBackupScheduler = startBackupScheduler();

const httpServer = createServer(app);
const gameIo = initGameEngine(httpServer);

app.use(errorHandler);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[SmartLecture] Server dang chay tai port ${PORT}`);
  for (const iface of NETWORK_INTERFACES) {
    console.log(`[SmartLecture] Truy cap LAN: http://${iface.address}:${PORT}`);
  }
});

let shutdownPromise: Promise<void> | undefined;
function shutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    console.log('[SmartLecture] shutting down');
    stopBackupScheduler();
    stopTunnel();
    await mdns.stop();
    console.log('[SmartLecture] mDNS stopped');
    await new Promise<void>((resolve) => gameIo.close(() => resolve()));
    console.log('[SmartLecture] Socket.IO stopped');
    stopGameEngineTimers();
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    db.close();
    console.log('[SmartLecture] shutdown complete');
    if (process.connected) process.disconnect();
    process.exitCode = 0;
  })();
  return shutdownPromise;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().catch((error: unknown) => {
      console.error('[SmartLecture] shutdown failed:', error);
      process.exitCode = 1;
    });
  });
}

if (process.env.SMARTLECTURE_TEST_MODE === '1' && process.connected) {
  process.on('message', (message: unknown) => {
    if (message === 'smartlecture:test-shutdown') {
      void shutdown().catch((error: unknown) => {
        console.error('[SmartLecture] test shutdown failed:', error);
        process.exitCode = 1;
        if (process.connected) process.disconnect();
      });
    }
  });
}
