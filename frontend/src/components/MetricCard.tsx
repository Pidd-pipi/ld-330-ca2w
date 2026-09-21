import { Card, Statistic } from 'antd';
import type { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: number;
  icon: ReactNode;
}

export function MetricCard({ title, value, icon }: MetricCardProps) {
  return (
    <Card className="metric-card">
      <Statistic title={title} value={value} prefix={icon} />
    </Card>
  );
}
