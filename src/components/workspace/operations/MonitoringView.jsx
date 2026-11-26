'use client';

import { Activity, Gauge, ShieldCheck, Workflow } from 'lucide-react';
import {
  Badge,
  Card,
  CardHead,
  CardText,
  CardTitle,
  Eyebrow,
  Grid,
  Header,
  Hint,
  Lead,
  Notice,
  Page,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDateTime } from '@/lib/ai/format';
import {
  EXECUTION_CATEGORY_LABELS,
  EXECUTION_STATUS_LABELS,
  EXECUTION_STATUS_TONES,
  INTEGRATION_STATUS_LABELS,
  INTEGRATION_STATUS_TONES,
  WORKFLOW_RUN_STATUS_LABELS,
  WORKFLOW_RUN_STATUS_TONES,
} from '@/lib/integrations/constants';
import OperationsNav from './OperationsNav';

const WORKER_LABELS = {
  running: 'Running',
  unhealthy: 'Unhealthy',
  not_running: 'Not running',
  unavailable: 'Unavailable',
};

const WORKER_TONES = {
  running: 'success',
  unhealthy: 'danger',
  not_running: 'muted',
  unavailable: 'muted',
};

const QUEUE_LABELS = {
  agentRuns: 'Agent runs',
  research: 'Research',
  websiteAudits: 'Website audits',
  integrationEvents: 'Webhook events',
  executions: 'Execution requests',
  workflows: 'Workflow runs',
  discoveryRuns: 'Discovery runs',
  discoveryScan: 'Discovery scheduler',
  reminderScan: 'Follow-up reminders',
};

function QueueRow({ name, counts }) {
  return (
    <tr>
      <td>{QUEUE_LABELS[name] || name}</td>
      {counts ? (
        <>
          <td>{counts.queued}</td>
          <td>{counts.active}</td>
          <td>{counts.failed}</td>
          <td>{counts.total}</td>
        </>
      ) : (
        <td colSpan={4} style={{ opacity: 0.6 }}>
          Queue not initialised yet
        </td>
      )}
    </tr>
  );
}

export default function MonitoringView({ overview, timezone }) {
  const worker = overview.worker || { status: 'unavailable' };
  const queue = overview.queue || null;
  const executionSummary = overview.executions;
  const automationSummary = overview.automations;

  return (
    <Page>
      <Header>
        <Eyebrow>Phase 2H · operations monitoring</Eyebrow>
        <Title>Monitoring</Title>
        <Lead>
          A read-only view of integration readiness, worker health, approvals and
          automation activity. Every value here comes from recorded state — an
          integration shows “not configured” rather than pretending to be
          connected.
        </Lead>
      </Header>
      <OperationsNav />

      <Notice $tone="warning">
        Live external actions remain disabled in this phase. The worker only
        serves read-only workflows and labelled mock executions.
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Configured integrations</StatLabel>
          <StatValue>{overview.integrations.configured}</StatValue>
          <StatNote>Credential names present in the environment</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Not configured</StatLabel>
          <StatValue>{overview.integrations.not_configured}</StatValue>
          <StatNote>Shown honestly, never as connected</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Failed executions</StatLabel>
          <StatValue>{executionSummary.failed}</StatValue>
          <StatNote>Approved but did not complete</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Failed automations</StatLabel>
          <StatValue>{automationSummary.failed}</StatValue>
          <StatNote>Retried within the attempt budget</StatNote>
        </StatCard>
      </StatGrid>

      <Grid>
        <Card>
          <CardHead>
            <div>
              <CardTitle>
                <Activity size={16} aria-hidden="true" /> Worker health
              </CardTitle>
              <CardText>The pg-boss worker publishes a remote or local health probe.</CardText>
            </div>
            <Badge $tone={WORKER_TONES[worker.status] || 'muted'}>
              {WORKER_LABELS[worker.status] || worker.status}
            </Badge>
          </CardHead>
          {worker.status === 'running' ? (
            <TableWrap>
              <Table>
                <tbody>
                  <tr>
                    <th>Started</th>
                    <td>{worker.startedAt ? formatDateTime(worker.startedAt, timezone) : '—'}</td>
                  </tr>
                  <tr>
                    <th>Jobs processed</th>
                    <td>{worker.processed}</td>
                  </tr>
                  <tr>
                    <th>Jobs failed</th>
                    <td>{worker.failed}</td>
                  </tr>
                </tbody>
              </Table>
            </TableWrap>
          ) : (
            <Hint>
              The worker is not reachable at its configured health URL. Ensure the
              Railway worker is running (or run <code>npm run ai:worker</code> locally);
              queued jobs wait safely until then.
            </Hint>
          )}
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>
                <ShieldCheck size={16} aria-hidden="true" /> Approvals & execution
              </CardTitle>
              <CardText>Approval is separate from execution.</CardText>
            </div>
          </CardHead>
          <TableWrap>
            <Table>
              <tbody>
                <tr>
                  <th>Pending agent approvals</th>
                  <td>{overview.approvals.pendingAgentRuns}</td>
                </tr>
                <tr>
                  <th>Execution requests awaiting approval</th>
                  <td>{executionSummary.awaitingApproval}</td>
                </tr>
                <tr>
                  <th>Executions active (queued/running)</th>
                  <td>{executionSummary.active}</td>
                </tr>
                <tr>
                  <th>Executions failed</th>
                  <td>{executionSummary.failed}</td>
                </tr>
                <tr>
                  <th>Webhook signing secret</th>
                  <td>{overview.webhookSecretConfigured ? 'Set' : 'Missing'}</td>
                </tr>
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      </Grid>

      <Grid>
        <Card>
          <CardHead>
            <div>
              <CardTitle>
                <Gauge size={16} aria-hidden="true" /> Integration health
              </CardTitle>
              <CardText>Every registered provider, grouped by current status.</CardText>
            </div>
          </CardHead>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries({
                  configured: overview.integrations.configured,
                  not_configured: overview.integrations.not_configured,
                  error: overview.integrations.error,
                  disconnected: overview.integrations.disconnected,
                }).map(([status, value]) => (
                  <tr key={status}>
                    <td>
                      <Badge $tone={INTEGRATION_STATUS_TONES[status]}>
                        {INTEGRATION_STATUS_LABELS[status]}
                      </Badge>
                    </td>
                    <td>{value}</td>
                    <td>{overview.integrations.total}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          {overview.integrationRows.filter((row) => row.status === 'error').length ? (
            <Hint>
              {overview.integrationRows.filter((row) => row.status === 'error').length}{' '}
              integration(s) recorded a sync error. Review them on the Integrations
              page.
            </Hint>
          ) : (
            <Hint>No integration is in an error state.</Hint>
          )}
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>
                <Workflow size={16} aria-hidden="true" /> Queue depth
              </CardTitle>
              <CardText>Live pg-boss counts across every registered queue.</CardText>
            </div>
          </CardHead>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Queued</th>
                  <th>Active</th>
                  <th>Failed</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {queue ? (
                  Object.keys(QUEUE_LABELS).map((name) => (
                    <QueueRow key={name} name={name} counts={queue[name]} />
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ opacity: 0.6 }}>
                      Queue metrics are unavailable right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </TableWrap>
          <Hint>
            Automations: {automationSummary.queued} queued · {automationSummary.running}{' '}
            running · {automationSummary.failed} failed.
          </Hint>
        </Card>
      </Grid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Recent executions</CardTitle>
            <CardText>The latest execution requests across the workspace.</CardText>
          </div>
        </CardHead>
        {executionSummary.recent.length === 0 ? (
          <Hint>No execution requests yet.</Hint>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Executed</th>
                </tr>
              </thead>
              <tbody>
                {executionSummary.recent.map((row) => (
                  <tr key={row.id}>
                    <td>{row.operation}</td>
                    <td>{EXECUTION_CATEGORY_LABELS[row.category] || row.category}</td>
                    <td>
                      <Badge $tone={EXECUTION_STATUS_TONES[row.status]}>
                        {EXECUTION_STATUS_LABELS[row.status] || row.status}
                      </Badge>
                    </td>
                    <td>{formatDateTime(row.createdAt, timezone)}</td>
                    <td>{row.executedAt ? formatDateTime(row.executedAt, timezone) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Recent automation runs</CardTitle>
            <CardText>The latest workflow runs and their outcomes.</CardText>
          </div>
        </CardHead>
        {automationSummary.recent.length === 0 ? (
          <Hint>No automation runs yet.</Hint>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Created</th>
                  <th>Finished</th>
                </tr>
              </thead>
              <tbody>
                {automationSummary.recent.map((run) => (
                  <tr key={run.id}>
                    <td>{run.label}</td>
                    <td>
                      <Badge $tone={WORKFLOW_RUN_STATUS_TONES[run.status]}>
                        {WORKFLOW_RUN_STATUS_LABELS[run.status] || run.status}
                      </Badge>
                    </td>
                    <td>{run.attempts}</td>
                    <td>{formatDateTime(run.createdAt, timezone)}</td>
                    <td>{run.finishedAt ? formatDateTime(run.finishedAt, timezone) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </Page>
  );
}
