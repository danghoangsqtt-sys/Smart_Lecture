import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import { Toaster } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ClassesPage from './pages/ClassesPage';
import LecturesPage from './pages/LecturesPage';
import MyLearningPage from './pages/MyLearningPage';
import QuestionsPage from './pages/QuestionsPage';
import RagPage from './pages/RagPage';
import LabPage from './pages/LabPage';
import ExamsPage from './pages/ExamsPage';
import ExamResultsPage from './pages/ExamResultsPage';
import MyExamsPage, { ExamRoomPage } from './pages/MyExamsPage';
import MyResultsPage from './pages/MyResultsPage';
import GamesPage from './pages/GamesPage';
import GamePlayPage from './pages/GamePlayPage';
import GradebookPage from './pages/GradebookPage';
import AttendancePage from './pages/AttendancePage';
import SettingsPage from './pages/SettingsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
          <Route path="/lectures" element={<LecturesPage />} />
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
          <Route path="/gradebook" element={<GradebookPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

