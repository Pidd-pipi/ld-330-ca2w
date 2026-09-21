import { CheckCircleOutlined, CloseCircleOutlined, FileSearchOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  extractApiError,
  fetchAccessLogs,
  fetchActiveConsents,
  fetchInstitutions,
  requestAccess,
} from '../api/consent';
import { searchPatients } from '../api/emr';
import { ACCESS_RESULT_META, CONSENT_PURPOSE_OPTIONS, CONSENT_STATUS_META } from '../constants/app';
import { formatDateTime, remainingText } from '../utils/datetime';
import type { AccessLog, AccessResult, Consent, Institution } from '../types/consent';
import type { Patient } from '../types/emr';

interface DeniedInfo {
  message: string;
  denyReason?: string;
  accessLogId?: number;
  at: string;
}

export function DoctorAccessPage() {
  const [form] = Form.useForm();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activeConsents, setActiveConsents] = useState<Consent[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [accessResult, setAccessResult] = useState<AccessResult | null>(null);
  const [denied, setDenied] = useState<DeniedInfo | null>(null);

  const institutionId = Form.useWatch('institutionId', form) as number | undefined;
  const patientId = Form.useWatch('patientId', form) as number | undefined;

  useEffect(() => {
    void (async () => {
      const [institutionList, patientList] = await Promise.all([fetchInstitutions(), searchPatients('')]);
      setInstitutions(institutionList);
      setPatients(patientList);
      form.setFieldsValue({
        institutionId: institutionList[0]?.id,
        patientId: patientList[0]?.id,
        purpose: 'outpatient',
        doctorName: '陈医生',
      });
    })();
  }, [form]);

  const reloadActive = useCallback(async (id?: number) => {
    if (!id) {
      setActiveConsents([]);
      return;
    }
    setActiveConsents(await fetchActiveConsents(id));
  }, []);

  const reloadLogs = useCallback(async (id?: number) => {
    if (!id) {
      setLogs([]);
      return;
    }
    setLogs(await fetchAccessLogs(id));
  }, []);

  useEffect(() => {
    void reloadActive(institutionId);
  }, [institutionId, reloadActive]);

  useEffect(() => {
    void reloadLogs(patientId);
    setAccessResult(null);
    setDenied(null);
  }, [patientId, reloadLogs]);

  const currentConsent = useMemo(
    () =>
      activeConsents.find(
        (item) => item.patientId === patientId && item.institutionId === institutionId,
      ) ?? null,
    [activeConsents, patientId, institutionId],
  );

  const patientOptions = patients.map((item) => ({
    value: item.id,
    label: `${item.name}（${item.recordNo}）`,
  }));

  const submitAccess = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    setAccessResult(null);
    setDenied(null);
    try {
      const result = await requestAccess(Number(values.patientId), {
        institutionId: Number(values.institutionId),
        purpose: values.purpose,
        doctorName: values.doctorName,
      });
      setAccessResult(result);
    } catch (error) {
      const maybe = error as { response?: { data?: { message?: string; denyReason?: string; accessLogId?: number } } };
      setDenied({
        message: extractApiError(error, '授权核验未通过，已拒绝调阅'),
        denyReason: maybe.response?.data?.denyReason,
        accessLogId: maybe.response?.data?.accessLogId,
        at: formatDateTime(new Date()),
      });
    } finally {
      setSubmitting(false);
      await Promise.all([reloadActive(institutionId), reloadLogs(patientId)]);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Alert
        type="warning"
        showIcon
        message="医生打开病历前，系统将核验授权是否有效且覆盖本次用途；撤回、到期或超范围一律拒绝。放行与拒绝都会记录调阅对象与时间。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="发起跨机构调阅">
            <Form form={form} layout="vertical">
              <Form.Item name="institutionId" label="我所在的医疗机构" rules={[{ required: true }]}>
                <Select
                  options={institutions.map((item) => ({ value: item.id, label: item.name }))}
                />
              </Form.Item>
              <Form.Item name="doctorName" label="调阅医生" rules={[{ required: true, message: '请填写医生姓名' }]}>
                <Input placeholder="例如：陈医生" maxLength={40} />
              </Form.Item>
              <Form.Item name="patientId" label="调阅对象（患者档案）" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={patientOptions} />
              </Form.Item>
              <Form.Item name="purpose" label="本次调阅用途" rules={[{ required: true }]}>
                <Select options={CONSENT_PURPOSE_OPTIONS} />
              </Form.Item>
              <Button
                type="primary"
                block
                size="large"
                icon={<FileSearchOutlined />}
                loading={submitting}
                onClick={() => void submitAccess()}
              >
                打开病历（先核验授权）
              </Button>
            </Form>
          </Card>

          <Card title="本机构当前有效授权" size="small" style={{ marginTop: 16 }}>
            {activeConsents.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前机构没有任何有效授权" />
            ) : (
              <Timeline
                items={activeConsents.map((item) => ({
                  color: 'green',
                  children: (
                    <Space direction="vertical" size={0}>
                      <strong>
                        {item.patientName}（{item.patientRecordNo}）
                      </strong>
                      <Space size={4} wrap>
                        {item.purposeLabels.map((label) => (
                          <Tag key={label} color="blue">{label}</Tag>
                        ))}
                      </Space>
                      <Typography.Text type="success" style={{ fontSize: 12 }}>
                        {remainingText(item.expiresAt)}（至 {formatDateTime(item.expiresAt)}）
                      </Typography.Text>
                    </Space>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          {accessResult?.allowed && (
            <Alert
              style={{ marginBottom: 16 }}
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message={`授权核验通过，已打开病历（审计 #${accessResult.accessLog.id} · ${formatDateTime(accessResult.accessLog.createdAt)}）`}
              description={
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="调阅对象">{accessResult.accessLog.target}</Descriptions.Item>
                  <Descriptions.Item label="授权用途">
                    {accessResult.consent?.purposeLabels.join('、')}
                  </Descriptions.Item>
                  <Descriptions.Item label="有效期至">{formatDateTime(accessResult.consent?.expiresAt)}</Descriptions.Item>
                </Descriptions>
              }
            />
          )}
          {denied && (
            <Alert
              style={{ marginBottom: 16 }}
              type="error"
              showIcon
              icon={<CloseCircleOutlined />}
              message={`调阅被拒绝：${denied.message}`}
              description={
                <Space direction="vertical" size={2}>
                  <span>拒绝原因码：{denied.denyReason ?? 'unknown'}</span>
                  <span>
                    本次失败已写入调阅审计（审计 #{denied.accessLogId ?? '—'} · {denied.at}），患者档案页可回查。
                  </span>
                </Space>
              }
            />
          )}

          <Card
            title="病历内容"
            extra={
              currentConsent ? (
                <Tag color={CONSENT_STATUS_META[currentConsent.effectiveStatus]?.color}>
                  授权{CONSENT_STATUS_META[currentConsent.effectiveStatus]?.label}
                </Tag>
              ) : (
                <Tag>无匹配授权</Tag>
              )
            }
          >
            {accessResult?.allowed ? (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={accessResult.records}
                columns={[
                  { title: '科室', dataIndex: 'department', width: 110 },
                  { title: '类型', dataIndex: 'recordType', width: 80 },
                  { title: '主诉', dataIndex: 'chiefComplaint' },
                  { title: '诊断', dataIndex: 'diagnosis' },
                  { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag>{v}</Tag> },
                ]}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={denied ? '授权核验未通过，病历内容不返回' : '请在左侧发起调阅，核验通过后在此展示病历'}
              />
            )}
          </Card>

          <Card title="该患者调阅记录（实时回查）" size="small" style={{ marginTop: 16 }}>
            <Table
              rowKey="id"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={logs}
              columns={[
                { title: '时间', dataIndex: 'createdAt', width: 170, render: (v: string) => formatDateTime(v) },
                { title: '机构', dataIndex: 'institutionName', width: 160 },
                { title: '医生', dataIndex: 'doctorName', width: 90 },
                { title: '用途', dataIndex: 'purposeLabel', width: 90 },
                {
                  title: '结果',
                  dataIndex: 'result',
                  width: 80,
                  render: (result: keyof typeof ACCESS_RESULT_META) => (
                    <Tag color={ACCESS_RESULT_META[result].color}>{ACCESS_RESULT_META[result].label}</Tag>
                  ),
                },
                {
                  title: '说明',
                  render: (_, record) =>
                    record.result === 'denied' ? (
                      <Typography.Text type="danger">{record.denyReasonLabel}</Typography.Text>
                    ) : (
                      <Typography.Text type="success">已返回病历</Typography.Text>
                    ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
