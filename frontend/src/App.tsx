import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';
import { DatabasePage } from './pages/DatabasePage';
import { HomePage } from './pages/HomePage';
import { MetricsPage } from './pages/MetricsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SqlPage } from './pages/SqlPage';
import { TablePage } from './pages/TablePage';
import { TablesPage } from './pages/TablesPage';

function NotFoundPage() {
  const location = useLocation();
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">404</p>
      <h1 className="mt-2 text-xl font-semibold">Rota não encontrada</h1>
      <p className="mt-1 break-all text-xs text-muted">{location.pathname}</p>
      <Link to="/" className="btn btn-primary mt-5">
        Voltar ao catálogo
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <AppShell>
            <HomePage />
          </AppShell>
        }
      />
      <Route path="/settings" element={<Navigate to="/settings" replace />} />
      <Route
        path="/preferences"
        element={
          <AppShell>
            <SettingsPage />
          </AppShell>
        }
      />
      <Route
        path="/db/:dbId"
        element={
          <AppShell>
            <DatabasePage />
          </AppShell>
        }
      />
      <Route
        path="/db/:dbId/tables"
        element={
          <AppShell>
            <TablesPage />
          </AppShell>
        }
      />
      <Route
        path="/db/:dbId/tables/:table"
        element={
          <AppShell>
            <TablePage />
          </AppShell>
        }
      />
      <Route
        path="/db/:dbId/metrics"
        element={
          <AppShell>
            <MetricsPage />
          </AppShell>
        }
      />
      <Route
        path="/db/:dbId/sql"
        element={
          <AppShell>
            <SqlPage />
          </AppShell>
        }
      />
      <Route
        path="*"
        element={
          <AppShell>
            <NotFoundPage />
          </AppShell>
        }
      />
    </Routes>
  );
}
