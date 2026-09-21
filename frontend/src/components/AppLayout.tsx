import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Layout, Menu, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../constants/app';

const { Header, Content } = Layout;

const NAV_ITEMS = [
  { key: '/', label: '病历工作台' },
  { key: '/consents', label: '患者授权档案' },
  { key: '/doctor', label: '跨机构调阅（医生）' },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey =
    NAV_ITEMS.find((item) => item.key !== '/' && location.pathname.startsWith(item.key))?.key ?? '/';

  return (
    <Layout className="app-shell">
      <Header className="topbar">
        <div className="topbar-brand" onClick={() => navigate('/')}>
          <SafetyCertificateOutlined className="topbar-logo" />
          <Typography.Title level={3}>{APP_NAME}</Typography.Title>
        </div>
        <Menu
          className="topbar-menu"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={NAV_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Header>
      <Content className="content">{children}</Content>
    </Layout>
  );
}
