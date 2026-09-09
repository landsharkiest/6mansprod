import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RouteFallback } from './components/RouteFallback';
import { useAuth } from './auth/AuthContext';
import { HomePage } from './pages/HomePage';
import type { ReactElement } from 'react';

// Every non-Home route is code-split so its page (and anything heavy it pulls in, like
// recharts or framer-motion) only downloads when a visitor actually navigates there. Home
// stays a static import since it's what every visitor loads first.
const PlayPage = lazy(() => import('./pages/PlayPage').then((m) => ({ default: m.PlayPage })));
const BlitzPage = lazy(() => import('./pages/BlitzPage').then((m) => ({ default: m.BlitzPage })));
const DailyPage = lazy(() => import('./pages/DailyPage').then((m) => ({ default: m.DailyPage })));
const ChallengePage = lazy(() => import('./pages/ChallengePage').then((m) => ({ default: m.ChallengePage })));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })));
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const UploadPage = lazy(() => import('./pages/UploadPage').then((m) => ({ default: m.UploadPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

function RequireAuth({ children, admin = false }: { children: ReactElement; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner" />;
  if (!user || (admin && !user.isAdmin)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/blitz" element={<BlitzPage />} />
          <Route path="/daily" element={<DailyPage />} />
          <Route path="/c/:token" element={<ChallengePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/stats" element={<StatsPage />} />
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
