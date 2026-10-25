import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './app/store';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { MyWork } from './pages/MyWork';
import { Projects } from './pages/Projects';
import { ProjectPage } from './pages/project/ProjectPage';
import { Intake } from './pages/Intake';
import { Gov } from './pages/Gov';
import { Visits } from './pages/Visits';
import { Finance } from './pages/Finance';
import { Team } from './pages/Team';
import { Access } from './pages/Access';
import { Process } from './pages/Process';
import { SettingsPage } from './pages/Settings';

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
          <Route path="intake" element={<Intake />} />
          <Route path="gov" element={<Gov />} />
          <Route path="visits" element={<Visits />} />
          <Route path="finance" element={<Finance />} />
          <Route path="team" element={<Team />} />
          <Route path="access" element={<Access />} />
          <Route path="process" element={<Process />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </StoreProvider>
);

export default App;
