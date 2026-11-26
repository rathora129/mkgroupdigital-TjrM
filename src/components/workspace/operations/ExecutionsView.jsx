'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, PlayCircle, X } from 'lucide-react';
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
  Stack,
  Table,
  TableWrap,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDateTime } from '@/lib/ai/format';
import { apiRequest } from '@/lib/ai/client';
import {
  EXECUTION_CATEGORIES,
  EXECUTION_CATEGORY_LABELS,
  EXECUTION_STATUS_LABELS,
  EXECUTION_STATUS_TONES,
  RISK_LEVELS,
  RISK_LEVEL_LABELS,
} from '@/lib/integrations/constants';
import OperationsNav from './OperationsNav';

export default function ExecutionsView({
  executions,
  clients,
  projects,
  integrations,
  capabilities,
  timezone,
}) {
  const router = useRouter();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const rows = executions.executions || [];

  async function act(url, body) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(url, { method: 'POST', body });
      router.refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createRequest(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    let payload = null;
    const rawPayload = String(data.get('payload') || '').trim();
    if (rawPayload) {
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        setError('The payload must be valid JSON.');
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest('/api/workforce/executions', {
        method: 'POST',
        body: {
          category: String(data.get('category') || ''),
          operation: String(data.get('operation') || ''),
          targetSystem: String(data.get('targetSystem') || ''),
          clientId: String(data.get('clientId') || '') || null,
          projectId: String(data.get('projectId') || '') || null,
          integrationId: String(data.get('integrationId') || '') || null,
          riskLevel: String(data.get('riskLevel') || 'medium'),
          requiredPermission: String(data.get('requiredPermission') || 'marketing.execute'),
          payload,
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

  return (
    <Page>
      <Header>
        <Eyebrow>Phase 2H · approval-gated execution</Eyebrow>
        <Title>Execution requests</Title>
        <Lead>
          Approval and execution are separate decisions. Even an approved
          request only runs through the labelled mock adapter in this phase —
          nothing is published, sent or spent.
        </Lead>
      </Header>
      <OperationsNav />

      {error ? <Notice $tone="danger">{error}</Notice> : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Requests</CardTitle>
            <CardText>
              {executions.total} request(s). A completed execution records its
              own evidence; approval alone never marks it done.
            </CardText>
          </div>
          <Actions>
            {capabilities.canRequest ? (
              <Button type="button" onClick={() => setShowForm((value) => !value)}>
                {showForm ? <X size={15} /> : <Plus size={15} />}
                {showForm ? 'Close' : 'New request'}
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {showForm ? (
          <form onSubmit={createRequest}>
            <Grid>
              <Field>
                <Label>Category</Label>
                <Select name="category" defaultValue="internal_record">
                  {EXECUTION_CATEGORIES.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Risk level</Label>
                <Select name="riskLevel" defaultValue="medium">
                  {RISK_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {RISK_LEVEL_LABELS[level]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Operation</Label>
                <Input name="operation" maxLength={200} required />
              </Field>
              <Field>
                <Label>Target system</Label>
                <Input name="targetSystem" maxLength={100} defaultValue="internal" required />
              </Field>
              <Field>
                <Label>Client</Label>
                <Select name="clientId" defaultValue="">
                  <option value="">No client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.companyName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Project</Label>
                <Select name="projectId" defaultValue="">
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Integration</Label>
                <Select name="integrationId" defaultValue="">
                  <option value="">Internal record only</option>
                  {integrations.map((integration) => (
                    <option key={integration.id} value={integration.id}>
                      {integration.name} ({integration.provider})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Required permission</Label>
                <Select name="requiredPermission" defaultValue="marketing.execute">
                  <option value="marketing.execute">Marketing execute</option>
                  <option value="integrations.manage">Integrations manage</option>
                  <option value="executions.execute">Executions execute</option>
                </Select>
              </Field>
            </Grid>
            <Field>
              <Label>Payload (JSON, optional)</Label>
              <Textarea name="payload" placeholder='{ "note": "test payload" }' />
            </Field>
            <Hint>
              External categories require a configured integration. Without one
              the request is refused rather than pretending to connect.
            </Hint>
            <Actions>
              <Button type="submit" $variant="primary" disabled={busy}>
                Submit request
              </Button>
            </Actions>
          </form>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState>
            <div>
              <h3>No execution requests yet</h3>
              <p>Propose an action, submit it for approval, then execute it.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Risk</th>
                  <th>Client / project</th>
                  <th>Timeline</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.operation}</strong>
                      <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                        {EXECUTION_CATEGORY_LABELS[row.category] || row.category} ·{' '}
                        {row.targetSystem}
                      </div>
                      {row.evidence ? (
                        <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>
                          Evidence: {row.evidence}
                        </div>
                      ) : null}
                      {row.failureReason ? (
                        <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>
                          {row.failureReason}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <Badge $tone={EXECUTION_STATUS_TONES[row.status]}>
                        {EXECUTION_STATUS_LABELS[row.status]}
                      </Badge>
                    </td>
                    <td>{RISK_LEVEL_LABELS[row.riskLevel] || row.riskLevel}</td>
                    <td style={{ fontSize: '0.75rem' }}>
                      {row.client?.companyName || '—'}
                      <div style={{ opacity: 0.7 }}>{row.project?.name || ''}</div>
                    </td>
                    <td style={{ fontSize: '0.72rem' }}>
                      {formatDateTime(row.createdAt, timezone)}
                      {row.decidedAt ? (
                        <div>Decided {formatDateTime(row.decidedAt, timezone)}</div>
                      ) : null}
                      {row.executedAt ? (
                        <div>Executed {formatDateTime(row.executedAt, timezone)}</div>
                      ) : null}
                    </td>
                    <td>
                      <Actions>
                        {row.status === 'proposed' && capabilities.canRequest ? (
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              act(`/api/workforce/executions/${row.id}/submit`)
                            }
                          >
                            Submit
                          </Button>
                        ) : null}
                        {row.status === 'awaiting_approval' && capabilities.canApprove ? (
                          <>
                            <Button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                act(`/api/workforce/executions/${row.id}/decision`, {
                                  decision: 'approved',
                                })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              $variant="danger"
                              disabled={busy}
                              onClick={() =>
                                act(`/api/workforce/executions/${row.id}/decision`, {
                                  decision: 'rejected',
                                })
                              }
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {['approved', 'failed'].includes(row.status) &&
                        capabilities.canExecute ? (
                          <Button
                            type="button"
                            $variant="primary"
                            disabled={busy}
                            onClick={() =>
                              act(`/api/workforce/executions/${row.id}/execute`)
                            }
                          >
                            <PlayCircle size={14} />
                            Run mock
                          </Button>
                        ) : null}
                        {['proposed', 'awaiting_approval', 'approved', 'queued'].includes(
                          row.status,
                        ) ? (
                          <Button
                            type="button"
                            $variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              act(`/api/workforce/executions/${row.id}/cancel`)
                            }
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

      <Notice $tone="warning">
        The mock run exercises the full lifecycle without a network call. Any
        real provider call stays disabled until a future phase explicitly
        enables and authorises it.
      </Notice>
      {busy ? <Hint>Working…</Hint> : null}
    </Page>
  );
}
