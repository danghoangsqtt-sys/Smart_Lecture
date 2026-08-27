import { db } from '../db/connection.js';
import { HttpError } from '../utils/errors.js';

const DEFAULT_LIMIT = 1000;

const DAILY_LIMITS: Record<string, number> = {
  'ai-generate-questions': 400,
  'ai-grade-essay': 200,
  'ai-comment-student': 150,
  'ai-comment-gradebook': 150,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function consumeQuota(feature: string): void {
  const limit = DAILY_LIMITS[feature] ?? DEFAULT_LIMIT;
  const date = today();
  const row = db
    .prepare('SELECT count FROM ai_usage_counters WHERE feature = ? AND usage_date = ?')
    .get(feature, date) as { count: number } | undefined;
  const current = row?.count ?? 0;
  if (current >= limit) {
    throw new HttpError(
      429,
      'QUOTA_EXCEEDED',
      `Đã đạt giới hạn ${limit} lượt dùng AI cho tính năng này trong hôm nay. Thử lại vào ngày mai.`
    );
  }
  db.prepare(
    `INSERT INTO ai_usage_counters (feature, usage_date, count) VALUES (?, ?, 1)
     ON CONFLICT(feature, usage_date) DO UPDATE SET count = count + 1`
  ).run(feature, date);
}

export function quotaStatus(): { feature: string; used: number; limit: number }[] {
  const date = today();
  const features = Object.keys(DAILY_LIMITS).filter((f) => f !== 'default');
  return features.map((feature) => {
    const row = db
      .prepare('SELECT count FROM ai_usage_counters WHERE feature = ? AND usage_date = ?')
      .get(feature, date) as { count: number } | undefined;
    return { feature, used: row?.count ?? 0, limit: DAILY_LIMITS[feature] ?? DEFAULT_LIMIT };
  });
}
