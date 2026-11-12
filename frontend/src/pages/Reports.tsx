import { Alert, Card, Col, Row, Statistic, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { getReports } from "../api/crm.api";

export default function Reports() {
  const query = useQuery({ queryKey: ["reports"], queryFn: getReports });
  const d = query.data ?? {};

  return (
    <>
      <Typography.Title level={3} className="page-title">
        Reports
      </Typography.Title>
      {query.isError && (
        <Alert type="error" showIcon message={query.error.message} style={{ marginBottom: 16 }} />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card loading={query.isLoading}>
            <Statistic title="Conversations" value={d.totalConversations ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={query.isLoading}>
            <Statistic title="Paused / Escalated" value={d.pausedOrEscalated ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={query.isLoading}>
            <Statistic title="Opted out" value={d.optedOut ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={query.isLoading}>
            <Statistic title="Pending bookings" value={d.pendingBookings ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={query.isLoading}>
            <Statistic title="Confirmed bookings" value={d.confirmedBookings ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={query.isLoading}>
            <Statistic title="Triggers fired" value={d.triggersFired ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={query.isLoading}>
            <Statistic title="Dead outbox calls" value={d.deadOutbox ?? 0} />
          </Card>
        </Col>
      </Row>
    </>
  );
}

