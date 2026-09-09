import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './auth/AuthContext';
import { HomePage } from './pages/HomePage';
import { PlayPage } from './pages/PlayPage';
import { DailyPage } from './pages/DailyPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { UploadPage } from './pages/UploadPage';
import { AdminPage } from './pages/AdminPage';
import type { ReactElement } from 'react';

function RequireAuth({ children, admin = false }: { children: ReactElement; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner" />;
  if (!user || (admin && !user.isAdmin)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/play" element={<PlayPage />} />
        <Route path="/daily" element={<DailyPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/u/:id" element={<ProfilePage />} />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="/upload"
          element={
            <RequireAuth>
              <UploadPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth admin>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
