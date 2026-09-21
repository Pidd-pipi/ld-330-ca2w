import { LockOutlined, ReloadOutlined, ThunderboltOutlined, UnlockOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  extractApiError,
  fetchAccessLogs,
  fetchConsents,
  fetchInstitutions,
  grantConsent,
  revokeConsent,
} from '../api/consent';
import { searchPatients } from '../api/emr';
import {
  ACCESS_RESULT_META,
  CONSENT_PURPOSE_OPTIONS,
  CONSENT_STATUS_META,
  GRANT_DURATION_OPTIONS,
} from '../constants/app';
import { formatDateTime, remainingText } from '../utils/datetime';
import type { AccessLog, Consent, Institution } from '../types/consent';
import type { Patient } from '../types/emr';

interface Feedback {
  type: 'success' | 'info' | 'error';
  text: string;
}

export function PatientConsentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Consent | null>(null);
  const [raceResult, setRaceResult] = useState<string[]>([]);
  const [racing, setRacing] = useState(false);
  const [grantForm] = Form.useForm();

  const patientId = Number(searchParams.get('patientId')) || 0;
  const selectedPatient = patients.find((item) => item.id === patientId) ?? null;

  const loadAll = useCallback(
    async (id: number, silent = false) => {
      if (!id) return;
      if (!silent) setLoading(true);
      try {
        const [consentList, logList] = await Promise.all([fetchConsents(id), fetchAccessLogs(id)]);
        setConsents(consentList);
        setAccessLogs(logList);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      const [patientList, institutionList] = await Promise.all([searchPatients(''), fetchInstitutions()]);
      setPatients(patientList);
      setInstitutions(institutionList);
      const firstId = patientList[0]?.id ?? 0;
      const initialId = Number(searchParams.get('patientId')) || firstId;
      if (initialId && initialId !== patientId) {
        setSearchParams({ patientId: String(initialId) }, { replace: true });
      }
      if (initialId) {
        await loadAll(initialId);
      }
    })();
    // 仅在挂载时初始化患者/机构字典
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (patientId) {
      setFeedback(null);
      void loadAll(patientId);
    } else {
      setConsents([]);
      setAccessLogs([]);
    }
  }, [patientId, loadAll]);

  const institutionName = useCallback(
    (id: number) => institutions.find((item) => item.id === id)?.name ?? `机构#${id}`,
    [institutions],
  );

  // 已被占用的机构不允许重复授权（重复授权走同一机构的“沿用/续期”语义）
  const activeInstitutionIds = useMemo(
    () => new Set(consents.filter((item) => item.effectiveStatus === 'active').map((item) => item.institutionId)),
    [consents],
  );

  const switchPatient = (id: number) => {
    setRaceResult([]);
    setFeedback(null);
    setSearchParams({ patientId: String(id) });
  };

  const submitGrant = async () => {
    const values = await grantForm.validateFields();
    try {
      const result = await grantConsent(patientId, {
        institutionId: values.institutionId,
        purposes: values.purposes,
        durationHours: values.durationHours,
      });
      setFeedback({
        type: result.mode === 'reused' ? 'info' : 'success',
        text: `${result.message}（${result.consent.institutionName}，有效期至 ${formatDateTime(result.consent.expiresAt)}）`,
      });
      setGrantOpen(false);
      grantForm.resetFields();
      await loadAll(patientId);
    } catch (error) {
      setFeedback({ type: 'error', text: extractApiError(error, '授权失败') });
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeConsent(patientId, revokeTarget.institutionId);
      setFeedback({ type: 'success', text: `已撤回对「${revokeTarget.institutionName}」的调阅授权` });
    } catch (error) {
      setFeedback({ type: 'error', text: extractApiError(error, '撤回失败') });
    } finally {
      setRevokeTarget(null);
      void loadAll(patientId);
    }
  };

  /**
   * 并发对决：同一时刻发出“撤回有效授权”和“再次授权同一机构”两个请求，
   * 后端用“患者+机构”粒度咨询锁串行化，只有一笔操作成功，另一笔收到 409 提示。
   */
  const runConcurrentRace = async () => {
    const target = consents.find((item) => item.effectiveStatus === 'active');
    if (!target) {
      message.warning('当前没有有效授权可对决，请先授予一条有效授权');
      return;
    }
    setRacing(true);
    setRaceResult([]);
    const startedAt = formatDateTime(new Date());

    const revokeTask = revokeConsent(patientId, target.institutionId)
      .then(() => '【撤回】成功：授权已置为已撤回')
      .catch((error) => `【撤回】失败：${extractApiError(error, '并发冲突，未执行')}`);
    const regrantTask = grantConsent(patientId, {
      institutionId: target.institutionId,
      purposes: target.purposes,
      durationHours: 24,
    })
      .then((res) => `【再次授权】成功：${res.mode === 'reused' ? '沿用原授权（无重复授权）' : res.message}`)
      .catch((error) => `【再次授权】失败：${extractApiError(error, '并发冲突，未执行')}`);

    const results = await Promise.allSettled([revokeTask, regrantTask]);
    const lines = results.map((item) => (item.status === 'fulfilled' ? item.value : `操作异常：${String(item.reason)}`));
    const successCount = lines.filter((line) => line.includes('成功')).length;
    setRaceResult([`发起时间：${startedAt} · 成功 ${successCount} 笔（要求恰好 1 笔）`, ...lines]);
    setRacing(false);
    await loadAll(patientId);
  };

  const consentColumns: ColumnsType<Consent> = [
    {
      title: '授权医疗机构',
      dataIndex: 'institutionName',
      render: (value, record) => (
        <Space direction="vertical" size={0}>
          <strong>{value}</strong>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.institutionCode}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '授权用途范围',
      dataIndex: 'purposeLabels',
      render: (labels: string[]) => (
        <Space size={4} wrap>
          {labels.map((label) => (
            <Tag color="blue" key={label}>{label}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'effectiveStatus',
      render: (status: keyof typeof CONSENT_STATUS_META, record) => (
        <Tooltip title={`版本 v${record.version}；状态字段=${record.status}`}>
          <Tag color={CONSENT_STATUS_META[status]?.color}>{CONSENT_STATUS_META[status]?.label ?? status}</Tag>
        </Tooltip>
      ),
    },
    {
      title: '授予时间',
      dataIndex: 'grantedAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '到期时间',
      dataIndex: 'expiresAt',
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <span>{formatDateTime(value)}</span>
          {record.effectiveStatus === 'active' && (
            <Typography.Text type="success" style={{ fontSize: 12 }}>{remainingText(value)}</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: '撤回时间',
      dataIndex: 'revokedAt',
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) =>
        record.effectiveStatus === 'active' ? (
          <Button danger size="small" icon={<LockOutlined />} onClick={() => setRevokeTarget(record)}>
            撤回
          </Button>
        ) : (
          <Tag>不可撤回</Tag>
        ),
    },
  ];

  const accessColumns: ColumnsType<AccessLog> = [
    {
      title: '调阅时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    { title: '调阅机构', dataIndex: 'institutionName', width: 180 },
    { title: '调阅医生', dataIndex: 'doctorName', width: 100 },
    { title: '用途', dataIndex: 'purposeLabel', width: 100 },
    {
      title: '结果',
      dataIndex: 'result',
      width: 90,
      render: (result: keyof typeof ACCESS_RESULT_META) => (
        <Tag color={ACCESS_RESULT_META[result].color}>{ACCESS_RESULT_META[result].label}</Tag>
      ),
    },
    {
      title: '失败原因 / 调阅对象',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          {record.result === 'denied' ? (
            <Typography.Text type="danger">{record.denyReasonLabel ?? '授权核验未通过'}</Typography.Text>
          ) : (
            <Typography.Text type="success">授权核验通过，已返回病历内容</Typography.Text>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.target}</Typography.Text>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card
        title="患者授权档案"
        extra={
          <Space>
            <Select
              style={{ width: 320 }}
              placeholder="选择患者档案"
              value={patientId || undefined}
              onChange={switchPatient}
              options={patients.map((item) => ({
                value: item.id,
                label: `${item.name}（${item.recordNo} · ${item.phone}）`,
              }))}
              showSearch
              optionFilterProp="label"
            />
            <Button icon={<ReloadOutlined />} onClick={() => void loadAll(patientId)}>刷新回查</Button>
          </Space>
        }
      >
        {selectedPatient && (
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }}>
            <Descriptions.Item label="姓名">{selectedPatient.name}</Descriptions.Item>
            <Descriptions.Item label="档案编号">{selectedPatient.recordNo}</Descriptions.Item>
            <Descriptions.Item label="身份证号">{selectedPatient.idCard}</Descriptions.Item>
            <Descriptions.Item label="手机号">{selectedPatient.phone}</Descriptions.Item>
            <Descriptions.Item label="过敏史">{selectedPatient.allergies || '无'}</Descriptions.Item>
            <Descriptions.Item label="既往病史" span={3}>{selectedPatient.history || '无'}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {feedback && (
        <Alert
          showIcon
          closable
          type={feedback.type}
          message={feedback.text}
          onClose={() => setFeedback(null)}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card
            title="有效授权（含历史授权）"
            extra={
              <Space>
                <Tooltip title="并发对决：同时发起撤回与再次授权，验证只有一处成功">
                  <Button icon={<ThunderboltOutlined />} loading={racing} onClick={() => void runConcurrentRace()}>
                    撤回 vs 再授权 并发对决
                  </Button>
                </Tooltip>
                <Button type="primary" icon={<UnlockOutlined />} disabled={!patientId} onClick={() => setGrantOpen(true)}>
                  授予限时授权
                </Button>
              </Space>
            }
          >
            <Table
              rowKey="id"
              size="small"
              loading={loading}
              dataSource={consents}
              columns={consentColumns}
              pagination={false}
              locale={{ emptyText: '暂无授权记录，可点击“授予限时授权”' }}
            />
            {raceResult.length > 0 && (
              <Alert
                style={{ marginTop: 12 }}
                type="info"
                showIcon
                message="并发对决结果"
                description={
                  <Space direction="vertical" size={2}>
                    {raceResult.map((line) => (
                      <Typography.Text
                        key={line}
                        type={line.includes('成功') ? 'success' : line.includes('失败') ? 'danger' : undefined}
                      >
                        {line}
                      </Typography.Text>
                    ))}
                  </Space>
                }
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="授权规则说明" size="small">
            <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 2 }}>
              <li>授权需指定<strong>医疗机构、用途范围、有效时长</strong>。</li>
              <li>同一机构重复授权：<strong>沿用原授权</strong>，只追加审计，不生成重复授权。</li>
              <li>到期、撤回或用途超范围时，医生调阅将被<strong>拒绝</strong>并留痕。</li>
              <li>撤回与再次授权并发时，<strong>仅一处成功</strong>，另一处收到冲突提示。</li>
              <li>所有放行/拒绝记录均持久化，<strong>刷新页面仍可回查</strong>。</li>
            </ul>
          </Card>
        </Col>
      </Row>

      <Card title="调阅记录（医生每次打开病历的审计）">
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={accessLogs}
          columns={accessColumns}
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: '暂无调阅记录' }}
        />
      </Card>

      <Modal
        title="授予跨机构限时调阅授权"
        open={grantOpen}
        onOk={() => void submitGrant()}
        onCancel={() => setGrantOpen(false)}
        okText="确认授予"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={grantForm} layout="vertical" initialValues={{ durationHours: 24, purposes: ['outpatient'] }}>
          <Form.Item
            name="institutionId"
            label="授权医疗机构"
            rules={[{ required: true, message: '请选择医疗机构' }]}
          >
            <Select
              placeholder="选择要授权的机构"
              options={institutions.map((item) => ({
                value: item.id,
                label: activeInstitutionIds.has(item.id) ? `${item.name}（已有有效授权，将沿用/续期）` : item.name,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="purposes"
            label="允许的调阅用途（超范围将拒绝）"
            rules={[{ required: true, message: '请至少勾选一个用途' }]}
          >
            <Select mode="multiple" options={CONSENT_PURPOSE_OPTIONS} placeholder="勾选授权用途" />
          </Form.Item>
          <Form.Item name="durationHours" label="有效时长" rules={[{ required: true, message: '请选择有效时长' }]}>
            <Select options={GRANT_DURATION_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="确认撤回授权"
        open={!!revokeTarget}
        onOk={() => void confirmRevoke()}
        onCancel={() => setRevokeTarget(null)}
        okText="确认撤回"
        cancelText="再想想"
        okButtonProps={{ danger: true }}
      >
        <p>
          撤回后，<strong>{revokeTarget?.institutionName}</strong> 将无法再调阅该患者病历，
          正在进行的调阅请求也会按最新状态重新核验。
        </p>
        <p style={{ color: '#999', fontSize: 12 }}>撤回操作与“再次授权”并发时，系统保证只有一处成功。</p>
      </Modal>
    </Space>
  );
}
