import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import { Spinner, Toaster } from './components/ui';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const ClassesPage = lazy(() => import('./pages/ClassesPage'));
const ClassDetailPage = lazy(() => import('./pages/ClassDetailPage'));
const TeachingModePage = lazy(() => import('./pages/TeachingModePage'));
const TeachingHubPage = lazy(() => import('./pages/TeachingHubPage'));
const LecturesPage = lazy(() => import('./pages/LecturesPage'));
const MyLearningPage = lazy(() => import('./pages/MyLearningPage'));
const QuestionsPage = lazy(() => import('./pages/QuestionsPage'));
const RagPage = lazy(() => import('./pages/RagPage'));
const LabPage = lazy(() => import('./pages/LabPage'));
const ExamsPage = lazy(() => import('./pages/ExamsPage'));
const ExamResultsPage = lazy(() => import('./pages/ExamResultsPage'));
const MyExamsPage = lazy(() => import('./pages/MyExamsPage'));
const ExamRoomPage = lazy(() => import('./pages/MyExamsPage').then((module) => ({ default: module.ExamRoomPage })));
const MyResultsPage = lazy(() => import('./pages/MyResultsPage'));
const GamesPage = lazy(() => import('./pages/GamesPage'));
const GamePlayPage = lazy(() => import('./pages/GamePlayPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/classes/:id/teach/:subjectId"
          element={
            <RequireAuth>
              <TeachingModePage />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/classes/:id" element={<ClassDetailPage />} />
          <Route path="/lectures" element={<LecturesPage />} />
<Route path="/teaching" element={<TeachingHubPage />} />
          <Route path="/learning" element={<MyLearningPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/rag" element={<RagPage />} />
          <Route path="/lab" element={<LabPage />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/:examId/results" element={<ExamResultsPage />} />
          <Route path="/my-exams" element={<MyExamsPage />} />
          <Route path="/my-exams/:examId" element={<ExamRoomPage />} />
          <Route path="/my-results" element={<MyResultsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/games/play" element={<GamePlayPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}

