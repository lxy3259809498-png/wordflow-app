import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Spinner, Toasts } from '@/components/ui';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Study = lazy(() => import('@/pages/Study'));
const Review = lazy(() => import('@/pages/Review'));
const Mistakes = lazy(() => import('@/pages/Mistakes'));
const Decks = lazy(() => import('@/pages/Decks'));
const Stats = lazy(() => import('@/pages/Stats'));
const Leaderboard = lazy(() => import('@/pages/Leaderboard'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const Pronunciation = lazy(() => import('@/pages/Pronunciation'));
const NotFound = lazy(() => import('@/pages/NotFound'));

export default function App() {
  return (
    <>
      <AppLayout>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/study" element={<Study />} />
            <Route path="/study/:sessionId" element={<Study />} />
            <Route path="/review" element={<Review />} />
            <Route path="/mistakes" element={<Mistakes />} />
            <Route path="/decks" element={<Decks />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/pronunciation" element={<Pronunciation />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppLayout>
      <Toasts />
    </>
  );
}
