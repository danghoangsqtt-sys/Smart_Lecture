import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

type SourceKind = 'subject' | 'lecture' | 'material' | 'teaching_plan' | 'curriculum_item' | 'lesson_plan';
type TargetKind = 'subject' | 'lesson' | 'material' | 'assignment' | 'progress';
type IssueKind = Exclude<SourceKind, 'subject'>;

type LegacySubject = { id: string; class_id: string; name: string; created_at: string; teacher_id: string };
type LegacyLecture = { id: string; class_id: string; subject_id: string | null; chapter: string; title: string; description: string; sort_order: number; created_at: string };
type LegacyMaterial = { id: string; lecture_id: string; type: string; title: string; file_path: string | null; link_url: string | null; original_name: string; mime_type: string; size_bytes: number; page_count: number; created_at: string };
type LegacyPlan = { id: string; class_id: string; subject_id: string | null };
type LegacyItem = { id: string; teaching_plan_id: string; lecture_id: string | null; planned_periods: number; completed_periods: number; status: string; created_at: string };
type LegacyLessonPlan = { id: string; curriculum_item_id: string };

export function migrateSharedCurriculum(db: DatabaseSync): void {
  const getMapped = db.prepare('SELECT target_id FROM shared_curriculum_legacy_map WHERE source_kind = ? AND source_id = ?');
  const addMap = db.prepare('INSERT INTO shared_curriculum_legacy_map (id, source_kind, source_id, target_kind, target_id) VALUES (?, ?, ?, ?, ?)');
  const setIssue = db.prepare(`INSERT INTO shared_curriculum_mapping_issues (id, source_kind, source_id, reason)
    VALUES (?, ?, ?, ?) ON CONFLICT(source_kind, source_id) DO UPDATE SET reason = excluded.reason`);
  const clearIssue = db.prepare('DELETE FROM shared_curriculum_mapping_issues WHERE source_kind = ? AND source_id = ?');
  const mapped = (kind: SourceKind, id: string): string | null =>
    (getMapped.get(kind, id) as { target_id: string } | undefined)?.target_id ?? null;
  const link = (kind: SourceKind, sourceId: string, targetKind: TargetKind, targetId: string): void => {
    addMap.run(randomUUID(), kind, sourceId, targetKind, targetId);
    if (kind !== 'subject') clearIssue.run(kind, sourceId);
  };
  const issue = (kind: IssueKind, sourceId: string, reason: string): void => {
    setIssue.run(randomUUID(), kind, sourceId, reason);
  };

  const subjects = db.prepare(`SELECT s.id, s.class_id, s.name, s.created_at, c.teacher_id
    FROM subjects s JOIN classes c ON c.id = s.class_id ORDER BY s.created_at, s.id`).all() as LegacySubject[];
  const insertSubject = db.prepare('INSERT INTO shared_subjects (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)');
  const insertAssignment = db.prepare('INSERT OR IGNORE INTO class_subject_assignments (id, class_id, subject_id) VALUES (?, ?, ?)');
  const getAssignment = db.prepare('SELECT id FROM class_subject_assignments WHERE class_id = ? AND subject_id = ?');
  const legacySubjectClass = new Map<string, string>();
  for (const source of subjects) {
    legacySubjectClass.set(source.id, source.class_id);
    let subjectId = mapped('subject', source.id);
    if (!subjectId) {
      subjectId = randomUUID();
      insertSubject.run(subjectId, source.teacher_id, source.name, source.created_at);
      link('subject', source.id, 'subject', subjectId);
    }
    insertAssignment.run(randomUUID(), source.class_id, subjectId);
  }

  const lectures = db.prepare(`SELECT id, class_id, subject_id, chapter, title, description, sort_order, created_at
    FROM lectures ORDER BY created_at, id`).all() as LegacyLecture[];
  const insertLesson = db.prepare(`INSERT INTO shared_lessons
    (id, subject_id, chapter, title, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const source of lectures) {
    if (mapped('lecture', source.id)) continue;
    if (!source.subject_id || !mapped('subject', source.subject_id)) {
      issue('lecture', source.id, 'MISSING_SUBJECT');
      continue;
    }
    if (legacySubjectClass.get(source.subject_id) !== source.class_id) {
      issue('lecture', source.id, 'CROSS_CLASS_SUBJECT');
      continue;
    }
    const lessonId = randomUUID();
    insertLesson.run(lessonId, mapped('subject', source.subject_id)!, source.chapter, source.title,
      source.description, source.sort_order, source.created_at);
    link('lecture', source.id, 'lesson', lessonId);
  }

  const materials = db.prepare(`SELECT id, lecture_id, type, title, file_path, link_url, original_name,
    mime_type, size_bytes, page_count, created_at FROM materials ORDER BY created_at, id`).all() as LegacyMaterial[];
  const insertMaterial = db.prepare(`INSERT INTO shared_lesson_materials
    (id, lesson_id, type, title, file_path, link_url, original_name, mime_type, size_bytes, page_count, asset_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const source of materials) {
    if (mapped('material', source.id)) continue;
    const lessonId = mapped('lecture', source.lecture_id);
    if (!lessonId) {
      issue('material', source.id, 'UNMAPPED_LECTURE');
      continue;
    }
    const materialId = randomUUID();
    const readyLink = source.type === 'link' && !!source.link_url?.trim();
    // File-backed legacy assets are not shared until T-8802 copies and verifies
    // them. Never point the new library at a file the legacy delete route owns.
    insertMaterial.run(materialId, lessonId, source.type, source.title, null,
      readyLink ? source.link_url : null, source.original_name, source.mime_type,
      source.size_bytes, source.page_count, readyLink ? 'ready' : 'pending_copy', source.created_at);
    link('material', source.id, 'material', materialId);
    if (!readyLink && (source.type === 'link' || !source.file_path)) {
      issue('material', source.id, source.type === 'link' ? 'LINK_WITHOUT_URL' : 'FILE_PATH_MISSING');
    }
  }

  const plans = db.prepare('SELECT id, class_id, subject_id FROM teaching_plans ORDER BY created_at, id').all() as LegacyPlan[];
  for (const source of plans) {
    if (mapped('teaching_plan', source.id)) continue;
    if (!source.subject_id || !mapped('subject', source.subject_id)) {
      issue('teaching_plan', source.id, 'MISSING_SUBJECT');
      continue;
    }
    if (legacySubjectClass.get(source.subject_id) !== source.class_id) {
      issue('teaching_plan', source.id, 'CROSS_CLASS_SUBJECT');
      continue;
    }
    const assignment = getAssignment.get(source.class_id, mapped('subject', source.subject_id)!) as { id: string } | undefined;
    if (!assignment) throw new Error(`Missing class-subject assignment for legacy plan ${source.id}`);
    link('teaching_plan', source.id, 'assignment', assignment.id);
  }

  const items = db.prepare(`SELECT id, teaching_plan_id, lecture_id, planned_periods, completed_periods, status, created_at
    FROM curriculum_items ORDER BY created_at, id`).all() as LegacyItem[];
  const getAssignmentSubject = db.prepare('SELECT subject_id FROM class_subject_assignments WHERE id = ?');
  const getLessonSubject = db.prepare('SELECT subject_id FROM shared_lessons WHERE id = ?');
  const getExistingProgress = db.prepare('SELECT id FROM class_lesson_progress WHERE assignment_id = ? AND lesson_id = ?');
  const insertProgress = db.prepare(`INSERT INTO class_lesson_progress
    (id, assignment_id, lesson_id, planned_periods, completed_periods, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const source of items) {
    if (mapped('curriculum_item', source.id)) continue;
    const assignmentId = mapped('teaching_plan', source.teaching_plan_id);
    const lessonId = source.lecture_id ? mapped('lecture', source.lecture_id) : null;
    if (!assignmentId) {
      issue('curriculum_item', source.id, 'UNMAPPED_PLAN');
      continue;
    }
    if (!lessonId) {
      issue('curriculum_item', source.id, source.lecture_id ? 'UNMAPPED_LECTURE' : 'MISSING_LECTURE');
      continue;
    }
    const assignmentSubject = (getAssignmentSubject.get(assignmentId) as { subject_id: string } | undefined)?.subject_id;
    const lessonSubject = (getLessonSubject.get(lessonId) as { subject_id: string } | undefined)?.subject_id;
    if (!assignmentSubject || !lessonSubject || assignmentSubject !== lessonSubject) {
      issue('curriculum_item', source.id, 'LECTURE_SUBJECT_MISMATCH');
      continue;
    }
    if (getExistingProgress.get(assignmentId, lessonId)) {
      issue('curriculum_item', source.id, 'DUPLICATE_LESSON_PROGRESS');
      continue;
    }
    const progressId = randomUUID();
    insertProgress.run(progressId, assignmentId, lessonId, source.planned_periods,
      source.completed_periods, source.status, source.created_at);
    link('curriculum_item', source.id, 'progress', progressId);
  }

  const lessonPlans = db.prepare('SELECT id, curriculum_item_id FROM lesson_plans ORDER BY created_at, id').all() as LegacyLessonPlan[];
  const getProgressLesson = db.prepare('SELECT lesson_id FROM class_lesson_progress WHERE id = ?');
  for (const source of lessonPlans) {
    if (mapped('lesson_plan', source.id)) continue;
    const progressId = mapped('curriculum_item', source.curriculum_item_id);
    const lessonId = progressId ? (getProgressLesson.get(progressId) as { lesson_id: string } | undefined)?.lesson_id : null;
    if (!lessonId) {
      issue('lesson_plan', source.id, 'UNMAPPED_ITEM');
      continue;
    }
    link('lesson_plan', source.id, 'lesson', lessonId);
  }
}
