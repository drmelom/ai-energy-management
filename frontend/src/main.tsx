import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import Analysis from './pages/Analysis';
import Anomalies from './pages/Anomalies';
import Dashboard from './pages/Dashboard';
import Investigation from './pages/Investigation';
import Login from './pages/Login';
import MeterDetail from './pages/MeterDetail';
import Meters from './pages/Meters';
import { RunProvider } from './state/run';
import { applyTheme } from './components/AppShell';

try { applyTheme((localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'); } catch { applyTheme('system'); }

const hasToken = () => { try { return !!sessionStorage.getItem('token'); } catch { return false; } };

function Guard({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return hasToken() ? <RunProvider>{children}</RunProvider> : <Navigate to="/login" replace state={{ from: loc.pathname }} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Guard><Dashboard /></Guard>} />
        <Route path="/meters" element={<Guard><Meters /></Guard>} />
        <Route path="/meters/:meterId" element={<Guard><MeterDetail /></Guard>} />
        <Route path="/anomalies" element={<Guard><Anomalies /></Guard>} />
        <Route path="/anomalies/:anomalyId" element={<Guard><Investigation /></Guard>} />
        <Route path="/analysis" element={<Guard><Analysis /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
