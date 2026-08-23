import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { NETWORK_INTERFACES, PORT, WEB_DIST_DIR } from './config.js';
import { migrate } from './db/connection.js';
import { seedAdmin } from './db/seed.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import classesRoutes from './routes/classes.routes.js';
import lecturesRoutes from './routes/lectures.routes.js';
import questionsRoutes from './routes/questions.routes.js';
import examsRoutes from './routes/exams.routes.js';
import gamesRoutes from './routes/games.routes.js';
import gradesRoutes from './routes/grades.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import aiRoutes from './routes/ai.routes.js';
import ragRoutes from './routes/rag.routes.js';
import systemRoutes, { advertiseMdns, detectDocling } from './routes/system.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import { initGameEngine } from './realtime/gameRoom.js';
import { startBackupScheduler } from './services/backup.js';
import { errorHandler } from './utils/errors.js';

migrate();
seedAdmin();

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '4mb' }));
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
  res.json({ ok: true, name: 'SmartLecture', time: new Date().toISOString(), interfaces: NETWORK_INTERFACES });
});

app.use('/api/auth', authRoutes);
app.use('/api', usersRoutes);
app.use('/api', classesRoutes);
app.use('/api', lecturesRoutes);
app.use('/api', questionsRoutes);
app.use('/api', examsRoutes);
app.use('/api', gamesRoutes);
app.use('/api', gradesRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', aiRoutes);
app.use('/api', ragRoutes);
app.use('/api', systemRoutes);
app.use('/api', settingsRoutes);

if (existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR));
  app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST_DIR, 'index.html'));
  });
}

void detectDocling();
advertiseMdns();
startBackupScheduler();

const httpServer = createServer(app);
initGameEngine(httpServer);

app.use(errorHandler);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[SmartLecture] Server dang chay tai port ${PORT}`);
  for (const iface of NETWORK_INTERFACES) {
    console.log(`[SmartLecture] Truy cap LAN: http://${iface.address}:${PORT}`);
  }
});
