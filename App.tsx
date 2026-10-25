import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './app/store';
import { Layout } from './components/Layout';
import { ScreenGuard } from './components/ScreenGuard';
import { Dashboard } from './pages/Dashboard';
import { MyWork } from './pages/MyWork';
import { Projects } from './pages/Projects';
import { ProjectPage } from './pages/project/ProjectPage';
import { Intake } from './pages/Intake';
import { Gov } from './pages/Gov';
import { Visits } from './pages/Visits';
import { Finance } from './pages/Finance';

const App: React.FC = () => (
  <StoreProvider>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="work" element={<MyWork />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectPage />} />
          <Route path="intake" element={<ScreenGuard screen="intake"><Intake /></ScreenGuard>} />
          <Route path="gov" element={<ScreenGuard screen="gov"><Gov /></ScreenGuard>} />
          <Route path="visits" element={<ScreenGuard screen="visits"><Visits /></ScreenGuard>} />
          <Route path="finance" element={<ScreenGuard screen="finance"><Finance /></ScreenGuard>} />
          {/* «الفريق والموارد», «الأدوار والصلاحيات», «مسار العمل» and «الإعدادات» are hidden: their pages stay in pages/ and come back by restoring the route and the nav item. */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </StoreProvider>
);

export default App;
