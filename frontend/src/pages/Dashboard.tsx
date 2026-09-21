import { FileDoneOutlined, MedicineBoxOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Form, Input, Layout, List, Row, Select, Space, Table, Tag, Timeline, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';
import '@wangeditor/editor/dist/css/style.css';
import { fetchSummary, fetchTimeline, searchPatients } from '../api/emr';
import { APP_NAME, PRESCRIPTION_STATUS, ROLE_OPTIONS } from '../constants/app';
import { MetricCard } from '../components/MetricCard';
import type { MedicalRecord, Patient, Summary } from '../types/emr';

const { Header, Content } = Layout;

export function Dashboard() {
  const [summary, setSummary] = useState<Summary>({ patientCount: 0, recordCount: 0, prescriptionCount: 0, workload: [] });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [timeline, setTimeline] = useState<MedicalRecord[]>([]);
  const [editorHtml, setEditorHtml] = useState('<p>主诉：发热伴咳嗽。诊疗计划：完善血常规检查。</p>');

  const load = async () => {
    const [summaryData, patientData] = await Promise.all([fetchSummary(), searchPatients('')]);
    setSummary(summaryData);
    setPatients(patientData);
    if (patientData[0]) {
      setTimeline(await fetchTimeline(patientData[0].id));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <Layout className="app-shell">
      <Header className="topbar">
        <Typography.Title level={3}>{APP_NAME}</Typography.Title>
        <Space>
          <Select defaultValue="doctor" options={ROLE_OPTIONS} />
          <Tag color="blue">JWT + 角色权限演示</Tag>
        </Space>
      </Header>
      <Content className="content">
        <Alert
          type="info"
          showIcon
          message="演示数据已包含患者档案、结构化病历、审签状态与审计日志，前端通过 /api 由 Nginx 反向代理到后端。"
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}><MetricCard title="患者档案" value={summary.patientCount} icon={<TeamOutlined />} /></Col>
          <Col xs={24} md={8}><MetricCard title="病历数量" value={summary.recordCount} icon={<FileDoneOutlined />} /></Col>
          <Col xs={24} md={8}><MetricCard title="处方数量" value={summary.prescriptionCount} icon={<MedicineBoxOutlined />} /></Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="患者档案快速检索">
              <Form layout="inline" onFinish={(values) => searchPatients(values.keyword ?? '').then(setPatients)}>
                <Form.Item name="keyword"><Input.Search placeholder="姓名 / 身份证号 / 手机号" enterButton="检索" /></Form.Item>
              </Form>
              <Table
                rowKey="id"
                dataSource={patients}
                pagination={false}
                onRow={(record) => ({ onClick: () => fetchTimeline(record.id).then(setTimeline) })}
                columns={[
                  { title: '档案编号', dataIndex: 'recordNo' },
                  { title: '姓名', dataIndex: 'name' },
                  { title: '性别', dataIndex: 'gender' },
                  { title: '年龄', dataIndex: 'age' },
                  { title: '过敏史', dataIndex: 'allergies' },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="病历时间轴与审签">
              <Timeline
                items={timeline.map((record) => ({
                  color: record.status === '已归档' ? 'green' : 'blue',
                  children: (
                    <Space direction="vertical">
                      <strong>{record.department} · {record.recordType}</strong>
                      <span>{record.chiefComplaint}</span>
                      <Tag>{record.status}</Tag>
                    </Space>
                  ),
                }))}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="结构化病历模板与富文本书写">
              <Toolbar editor={null} defaultConfig={{}} mode="default" />
              <Editor defaultConfig={{ placeholder: '录入主诉、现病史、体格检查、诊断与治疗方案' }} value={editorHtml} onChange={(editor) => setEditorHtml(editor.getHtml())} mode="default" />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="处方预览与状态跟踪">
              <List
                dataSource={[
                  { drug: '阿莫西林胶囊', spec: '0.25g*24粒', usage: '0.5g 口服 tid 5天' },
                  { drug: '布洛芬缓释胶囊', spec: '0.3g*20粒', usage: '0.3g 口服 bid 3天' },
                ]}
                renderItem={(item, index) => (
                  <List.Item actions={[<Tag color="gold">{PRESCRIPTION_STATUS[index]}</Tag>, <Button>打印</Button>]}>
                    <List.Item.Meta title={item.drug} description={`${item.spec} · ${item.usage}`} />
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
