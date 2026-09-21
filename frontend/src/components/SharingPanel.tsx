import { Alert, Button, Card, Form, Input, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import {
  accessRecords,
  fetchInstitutions,
  fetchSharing,
  grantAuthorization,
  renewAuthorization,
  revokeAuthorization,
} from '../api/emr';
import { AUTHORIZATION_STATUS_TAG, DURATION_OPTIONS, SHARE_PURPOSES } from '../constants/app';
import type { Institution, Patient, ShareAuthorization, SharingOverview } from '../types/emr';

const formatTime = (value: string | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-');

const errorText = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join('；');
    if (data?.message) return data.message;
  }
  return fallback;
};

export function SharingPanel({ patient }: { patient: Patient }) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [overview, setOverview] = useState<SharingOverview>({ authorizations: [], audits: [] });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [grantForm] = Form.useForm();
  const [accessForm] = Form.useForm();
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setOverview(await fetchSharing(patient.id));
  }, [patient.id]);

  useEffect(() => {
    void fetchInstitutions().then(setInstitutions);
  }, []);

  useEffect(() => {
    setFeedback(null);
    grantForm.resetFields();
    accessForm.resetFields();
    void reload();
  }, [reload, grantForm, accessForm]);

  const runSafely = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 409) {
        message.warning(errorText(error, '授权状态已被其他操作变更，请刷新后重试'));
      } else {
        message.error(errorText(error, '操作失败，请稍后重试'));
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const onGrant = (values: { institutionId: number; purpose: string; durationHours: number }) =>
    runSafely(async () => {
      const result = await grantAuthorization(patient.id, values);
      message.success(
        result.duplicated
          ? `已存在覆盖该用途的有效授权（#${result.authorization.id}），未生成重复授权`
          : `授权成功，有效期至 ${formatTime(result.authorization.expiresAt)}`,
      );
      await reload();
    });

  const onRevoke = (authorization: ShareAuthorization) =>
    runSafely(async () => {
      await revokeAuthorization(authorization.id, authorization.version);
      message.success(`授权 #${authorization.id} 已撤回`);
      await reload();
    });

  const onRenew = (authorization: ShareAuthorization) =>
    runSafely(async () => {
      const renewed = await renewAuthorization(authorization.id, authorization.version, authorization.durationHours);
      message.success(`授权 #${authorization.id} 已续期至 ${formatTime(renewed.expiresAt)}`);
      await reload();
    });

  const onAccess = async (values: { institutionId: number; doctor: string; purpose: string }) => {
    setBusy(true);
    try {
      const result = await accessRecords(patient.id, values);
      setFeedback({
        type: 'success',
        text: `调阅成功：授权 #${result.authorization.id} 有效且覆盖「${values.purpose}」，已记录调阅对象与时间（共 ${result.records.length} 份病历）。`,
      });
    } catch (error) {
      setFeedback({ type: 'error', text: `调阅被拒绝：${errorText(error, '授权核验未通过')}` });
    } finally {
      setBusy(false);
      await reload();
    }
  };

  return (
    <Card
      title={`跨机构调阅闭环 · ${patient.name}（${patient.recordNo}）`}
      extra={<Typography.Text type="secondary">授权、调阅与审计均落库，刷新后可回查</Typography.Text>}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Form form={grantForm} layout="inline" onFinish={onGrant} initialValues={{ purpose: SHARE_PURPOSES[0], durationHours: 24 }}>
          <Form.Item name="institutionId" rules={[{ required: true, message: '请选择机构' }]}>
            <Select
              placeholder="授权机构"
              style={{ width: 200 }}
              options={institutions.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
          <Form.Item name="purpose" rules={[{ required: true }]}>
            <Select style={{ width: 130 }} options={SHARE_PURPOSES.map((item) => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item name="durationHours" rules={[{ required: true }]}>
            <Select style={{ width: 110 }} options={DURATION_OPTIONS} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={busy}>
              患者授权
            </Button>
          </Form.Item>
        </Form>

        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={overview.authorizations}
          locale={{ emptyText: '暂无授权记录' }}
          columns={[
            { title: '授权编号', dataIndex: 'id', width: 90, render: (id: number) => `#${id}` },
            { title: '机构', dataIndex: 'institutionName' },
            { title: '用途', dataIndex: 'purpose', width: 100 },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (status: string) => {
                const tag = AUTHORIZATION_STATUS_TAG[status] ?? { color: 'default', label: status };
                return <Tag color={tag.color}>{tag.label}</Tag>;
              },
            },
            { title: '到期时间', dataIndex: 'expiresAt', render: formatTime },
            {
              title: '操作',
              key: 'actions',
              width: 150,
              render: (_, record) =>
                record.status === 'active' ? (
                  <Space>
                    <Button size="small" onClick={() => onRenew(record)} disabled={busy}>
                      再次授权
                    </Button>
                    <Popconfirm title="确认撤回该授权？" onConfirm={() => onRevoke(record)}>
                      <Button size="small" danger disabled={busy}>
                        撤回
                      </Button>
                    </Popconfirm>
                  </Space>
                ) : null,
            },
          ]}
        />

        <Form form={accessForm} layout="inline" onFinish={onAccess} initialValues={{ doctor: '王主任', purpose: SHARE_PURPOSES[0] }}>
          <Form.Item name="institutionId" rules={[{ required: true, message: '请选择调阅机构' }]}>
            <Select
              placeholder="调阅机构"
              style={{ width: 200 }}
              options={institutions.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
          <Form.Item name="doctor" rules={[{ required: true, message: '请填写医生姓名' }]}>
            <Input placeholder="调阅医生" style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="purpose" rules={[{ required: true }]}>
            <Select style={{ width: 130 }} options={SHARE_PURPOSES.map((item) => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item>
            <Button htmlType="submit" loading={busy}>
              调阅病历
            </Button>
          </Form.Item>
        </Form>

        {feedback && (
          <Alert
            type={feedback.type}
            showIcon
            closable
            message={feedback.text}
            onClose={() => setFeedback(null)}
          />
        )}

        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          dataSource={overview.audits}
          locale={{ emptyText: '暂无调阅记录' }}
          columns={[
            { title: '调阅时间', dataIndex: 'accessedAt', render: formatTime },
            { title: '机构', dataIndex: 'institutionName' },
            { title: '医生', dataIndex: 'doctor', width: 100 },
            { title: '用途', dataIndex: 'purpose', width: 100 },
            {
              title: '结果',
              dataIndex: 'result',
              width: 90,
              render: (result: string) =>
                result === 'allowed' ? <Tag color="green">成功</Tag> : <Tag color="red">拒绝</Tag>,
            },
            { title: '拒绝原因', dataIndex: 'denyReason', render: (reason: string | null) => reason ?? '-' },
          ]}
        />
      </Space>
    </Card>
  );
}
