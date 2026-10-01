import { api, ApiError } from './api';
import { useAuthStore } from '../stores/authStore';
import type { ApiErrorBody, SharedClassSubject, SharedLesson, SharedLessonProgress, SharedMaterial, SharedQuestion, SharedSubject } from '../types';

export interface ClassChoice { id: string; name: string; studentCount: number; }
export interface BankQuestion { id: string; content: string; type: string; }

export const sharedCurriculum = {
  subjects: async () => (await api<{ subjects: SharedSubject[] }>('/shared/subjects')).subjects,
  classes: async () => (await api<{ classes: ClassChoice[] }>('/classes/mine')).classes,
  classSubjects: async (classId: string) =>
    (await api<{ assignments: SharedClassSubject[] }>(`/shared/classes/${classId}/subjects`)).assignments,
  lessons: async (subjectId: string) =>
    (await api<{ subject: SharedSubject; lessons: SharedLesson[] }>(`/shared/subjects/${subjectId}/lessons`)).lessons,
  materials: async (lessonId: string) =>
    (await api<{ materials: SharedMaterial[] }>(`/shared/lessons/${lessonId}/materials`)).materials,
  questions: async (lessonId: string) =>
    (await api<{ questions: SharedQuestion[] }>(`/shared/lessons/${lessonId}/questions`)).questions,
  bankQuestions: async () => (await api<{ questions: BankQuestion[] }>('/questions?limit=500')).questions,
  progress: async (classId: string, subjectId: string) =>
    (await api<{ progress: SharedLessonProgress[] }>(`/shared/classes/${classId}/subjects/${subjectId}/progress`)).progress,
  createSubject: async (name: string, description = '') =>
    (await api<{ subject: SharedSubject }>('/shared/subjects', { method: 'POST', body: JSON.stringify({ name, description }) })).subject,
  updateSubject: async (id: string, name: string, description: string) =>
    (await api<{ subject: SharedSubject }>(`/shared/subjects/${id}`, { method: 'PATCH', body: JSON.stringify({ name, description }) })).subject,
  assign: async (subjectId: string, classId: string) =>
    api(`/shared/subjects/${subjectId}/classes`, { method: 'POST', body: JSON.stringify({ classId }) }),
  unassign: async (subjectId: string, classId: string) =>
    api(`/shared/subjects/${subjectId}/classes/${classId}`, { method: 'DELETE' }),
  createLesson: async (subjectId: string, title: string, chapter: string, description: string, sortOrder: number) =>
    (await api<{ lesson: SharedLesson }>(`/shared/subjects/${subjectId}/lessons`, {
      method: 'POST', body: JSON.stringify({ title, chapter, description, sortOrder }),
    })).lesson,
  updateLesson: async (lessonId: string, title: string, chapter: string, description: string, sortOrder: number) =>
    (await api<{ lesson: SharedLesson }>(`/shared/lessons/${lessonId}`, {
      method: 'PATCH', body: JSON.stringify({ title, chapter, description, sortOrder }),
    })).lesson,
  linkQuestion: async (lessonId: string, questionId: string) =>
    api(`/shared/lessons/${lessonId}/questions`, { method: 'POST', body: JSON.stringify({ questionId }) }),
  unlinkQuestion: async (lessonId: string, questionId: string) =>
    api(`/shared/lessons/${lessonId}/questions/${questionId}`, { method: 'DELETE' }),
  addLink: async (lessonId: string, title: string, linkUrl: string) =>
    api(`/shared/lessons/${lessonId}/materials/link`, { method: 'POST', body: JSON.stringify({ title, linkUrl }) }),
  copyLegacy: async (materialId: string) =>
    api(`/shared/materials/${materialId}/copy-legacy`, { method: 'POST' }),
  deleteMaterial: async (materialId: string) =>
    api(`/shared/materials/${materialId}`, { method: 'DELETE' }),
  saveProgress: async (classId: string, subjectId: string, lessonId: string,
    progress: { plannedPeriods: number; completedPeriods: number; status: 'pending' | 'in_progress' | 'completed' }) =>
    api(`/shared/classes/${classId}/subjects/${subjectId}/lessons/${lessonId}/progress`, {
      method: 'PUT', body: JSON.stringify(progress),
    }),
};

export async function uploadSharedMaterial(lessonId: string, file: File, title: string): Promise<SharedMaterial> {
  const form = new FormData();
  form.set('file', file);
  form.set('title', title);
  const response = await fetch(`/api/shared/lessons/${lessonId}/materials`, {
    method: 'POST', body: form, credentials: 'same-origin',
  });
  if (!response.ok) {
    if (response.status === 401) useAuthStore.getState().clearAuth();
    let message = `Lỗi máy chủ (${response.status})`;
    let code = 'UNKNOWN';
    try {
      const payload = await response.json() as ApiErrorBody;
      message = payload.error?.message ?? message;
      code = payload.error?.code ?? code;
    } catch { /* Keep fallback message. */ }
    throw new ApiError(response.status, code, message);
  }
  return (await response.json() as { material: SharedMaterial }).material;
}
