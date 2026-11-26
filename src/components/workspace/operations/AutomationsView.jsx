'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, Workflow, X } from 'lucide-react';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  EmptyState,
  Eyebrow,
  Field,
  Grid,
  Header,
  Hint,
  Input,
  Label,
  Lead,
  Notice,
  Page,
  Select,
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
import { apiRequest } from '@/lib/ai/client';
import { WORKFLOW_LABELS } from '@/lib/automation/constants';
import {
  WORKFLOW_RUN_STATUS_LABELS,
  WORKFLOW_RUN_STATUS_TONES,
} from '@/lib/integrations/constants';
import OperationsNav from './OperationsNav';

export default function AutomationsView({
  runs,
  definitions,
  clients,
  projects,
  canManage,
  timezone,
}) {
  const router = useRouter();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedKey, setSelectedKey] = useState(definitions[0]?.key || '');
  const [detail, setDetail] = useState(null);

  const rows = runs.runs || [];
  const definition = definitions.find((item) => item.key === selectedKey) || null;
  const summary = rows.reduce(
    (acc, run) => {
      if (acc[run.status] !== undefined) acc[run.status] += 1;
      return acc;
    },
    { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
  );

  async function startRun(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiRequest('/api/workforce/automations', {
        method: 'POST',
        body: {
          workflowKey: String(data.get('workflowKey') || ''),
          clientId: String(data.get('clientId') || '') || null,
          projectId: String(data.get('projectId') || '') || null,
          input: null,
        },
      });
      setShowForm(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelRun(runId) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/workforce/automations/${runId}/cancel`, {
        method: 'POST',
      });
      router.refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(runId) {
    setBusy(true);
    setError(null);
    try {
      const run = await apiRequest(`/api/workforce/automations/${runId}`);
      setDetail(run);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Phase 2H · orchestration on the existing worker</Eyebrow>
        <Title>Automations</Title>
        <Lead>
          Workflows run as read-only summaries on the same pg-boss worker. They
          cannot publish, message a customer, spend budget or skip an approval —
          every step only reads workspace-scoped records.
        </Lead>
      </Header>
      <OperationsNav />

      {error ? <Notice $tone="danger">{error}</Notice> : null}

      <StatGrid>
        <StatCard>
          <StatLabel>Queued</StatLabel>
          <StatValue>{summary.queued}</StatValue>
          <StatNote>Waiting for the worker to pick them up</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Running</StatLabel>
          <StatValue>{summary.running}</StatValue>
          <StatNote>Executing their read-only steps</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Failed</StatLabel>
          <StatValue>{summary.failed}</StatValue>
          <StatNote>Retried until the attempt budget is spent</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Templates</StatLabel>
          <StatValue>{definitions.length}</StatValue>
          <StatNote>Available workflow definitions</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Workflow runs</CardTitle>
            <CardText>
              {runs.total} run(s) recorded. A run is only “completed” once the
              worker has written every step result.
            </CardText>
          </div>
          <Actions>
            {canManage ? (
              <Button type="button" onClick={() => setShowForm((value) => !value)}>
                {showForm ? <X size={15} /> : <Plus size={15} />}
                {showForm ? 'Close' : 'Start workflow'}
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {showForm ? (
          <form onSubmit={startRun}>
            <Grid>
              <Field>
                <Label>Workflow</Label>
                <Select
                  name="workflowKey"
                  value={selectedKey}
                  onChange={(event) => setSelectedKey(event.target.value)}
                >
                  {definitions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Client {definition?.requiresClient ? '' : '(optional)'}</Label>
                <Select
                  name="clientId"
                  defaultValue=""
                  required={Boolean(definition?.requiresClient)}
                >
                  <option value="">
                    {definition?.requiresClient ? 'Choose a client' : 'No client'}
                  </option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.companyName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Project {definition?.requiresProject ? '' : '(optional)'}</Label>
                <Select
                  name="projectId"
                  defaultValue=""
                  required={Boolean(definition?.requiresProject)}
                >
                  <option value="">
                    {definition?.requiresProject ? 'Choose a project' : 'No project'}
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </Grid>
            {definition ? <Hint>{definition.description}</Hint> : null}
            <Actions>
              <Button type="submit" $variant="primary" disabled={busy}>
                Queue run
              </Button>
            </Actions>
          </form>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState>
            <div>
              <h3>No automation runs yet</h3>
              <p>Start a workflow to produce a read-only operations summary.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Timeline</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>{WORKFLOW_LABELS[run.workflowKey] || run.workflowKey}</strong>
                      {run.lastError ? (
                        <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>
                          {run.lastError}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <Badge $tone={WORKFLOW_RUN_STATUS_TONES[run.status]}>
                        {WORKFLOW_RUN_STATUS_LABELS[run.status] || run.status}
                      </Badge>
                    </td>
                    <td>{run.attempts}</td>
                    <td style={{ fontSize: '0.72rem' }}>
                      {formatDateTime(run.createdAt, timezone)}
                      {run.finishedAt ? (
                        <div>Finished {formatDateTime(run.finishedAt, timezone)}</div>
                      ) : null}
                    </td>
                    <td>
                      <Actions>
                        <Button
                          type="button"
                          $variant="ghost"
                          disabled={busy}
                          onClick={() => openDetail(run.id)}
                        >
                          View
                        </Button>
                        {run.status === 'queued' && canManage ? (
                          <Button
                            type="button"
                            $variant="danger"
                            disabled={busy}
                            onClick={() => cancelRun(run.id)}
                          >
                            Cancel
                          </Button>
                        ) : null}
                      </Actions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {detail ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>
                <Workflow size={16} aria-hidden="true" />{' '}
                {WORKFLOW_LABELS[detail.workflowKey] || detail.workflowKey}
              </CardTitle>
              <CardText>
                {WORKFLOW_RUN_STATUS_LABELS[detail.status] || detail.status} ·{' '}
                {detail.steps.length} step(s)
              </CardText>
            </div>
            <Actions>
              <Button type="button" $variant="ghost" onClick={() => setDetail(null)}>
                <X size={15} /> Close
              </Button>
            </Actions>
          </CardHead>
          {detail.steps.length === 0 ? (
            <Hint>No steps recorded yet. The worker writes them as it runs.</Hint>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Status</th>
                    <th>Detail</th>
                    <th>Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.steps.map((step) => (
                    <tr key={step.id}>
                      <td>{step.label}</td>
                      <td>{step.status}</td>
                      <td style={{ fontSize: '0.75rem' }}>
                        {step.detail ? JSON.stringify(step.detail) : '—'}
                      </td>
                      <td style={{ fontSize: '0.72rem' }}>
                        {step.finishedAt ? formatDateTime(step.finishedAt, timezone) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      ) : null}

      <Notice $tone="warning">
        <RefreshCw size={14} aria-hidden="true" /> Reminders and notifications
        produced by these workflows are internal summaries only. No email, social
        post or ad change is sent to an external party in this phase.
      </Notice>
      {busy ? <Hint>Working…</Hint> : null}
    </Page>
  );
}
