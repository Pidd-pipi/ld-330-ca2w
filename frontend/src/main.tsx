import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { PatientConsentsPage } from './pages/PatientConsentsPage';
import { DoctorAccessPage } from './pages/DoctorAccessPage';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1677ff', borderRadius: 6 } }}>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/consents" element={<PatientConsentsPage />} />
            <Route path="/doctor" element={<DoctorAccessPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
