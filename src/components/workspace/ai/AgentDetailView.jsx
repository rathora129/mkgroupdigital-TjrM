'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormik } from 'formik';
import * as yup from 'yup';
import {
  ArrowLeft,
  BadgeCheck,
  CircleAlert,
  Loader2,
  Pencil,
  Play,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import styled from 'styled-components';
import { getAgentType } from '@/lib/ai/agent-types';
import { apiRequest } from '@/lib/ai/client';
import {
  formatCents,
  formatDateTime,
  formatDuration,
  formatTokens,
  statusMeta,
} from '@/lib/ai/format';
import AgentForm from './AgentForm';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  ErrorText,
  Field,
  Grid,
  Header,
  Hint,
  Label,
  LinkButton,
  Notice,
  Page,
  Row,
  Stack,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Textarea,
  Title,
  Eyebrow,
} from './primitives';

const OPEN_STATUSES = ['queued', 'running', 'awaiting_approval'];

const UsageBar = styled.div`
  height: 7px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.surfaceMuted};
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    width: ${({ $percent }) => `${Math.min(100, Math.max(0, $percent))}%`};
    background: ${({ theme, $tone }) =>
      $tone === 'danger' ? theme.colors.danger : theme.colors.primary};
  }
`;

const runSchema = yup.object({
  input: yup
    .string()
    .trim()
    .min(1, 'Describe what the agent should do.')
    .max(20_000, 'Input must be 20,000 characters or fewer.')
    .required('Run input is required.'),
});

function makeRequestKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function limitRow(label, used, limit, formatter) {
  if (limit == null) {
    return (
      <Hint>
        {formatter(used)} {label.toLowerCase()} used this month · no limit set.
      </Hint>
    );
  }
  const percent = limit > 0 ? (used / limit) * 100 : 100;
  return (
    <Stack $gap={6}>
      <UsageBar $percent={percent} $tone={percent >= 100 ? 'danger' : 'info'}>
        <span />
      </UsageBar>
      <Hint>
        {formatter(used)} of {formatter(limit)} {label.toLowerCase()} this month
        (UTC).
      </Hint>
    </Stack>
  );
}

export default function AgentDetailView({
  agent,
  providers,
  runs,
  usage,
  runtimeConfigured,
  canManage,
  canRun,
  timezone,
}) {
  const router = useRouter();
  const [requestKey, setRequestKey] = useState(makeRequestKey);
  const [editing, setEditing] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [busyRunId, setBusyRunId] = useState(null);

  const typeMeta = getAgentType(agent.type);
  const providerMeta = providers.find((item) => item.key === agent.provider);

  function refresh(message) {
    if (message) setNotice(message);
    router.refresh();
  }

  const formik = useFormik({
    initialValues: { input: '' },
    validationSchema: runSchema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      setNotice(null);
      try {
        const data = await apiRequest('/api/workforce/ai/runs', {
          method: 'POST',
          body: {
            agentId: agent.id,
            input: values.input,
            idempotencyKey: requestKey,
          },
        });
        setLastRun(data.run);
        setRequestKey(makeRequestKey());
        helpers.resetForm();
        router.refresh();
      } catch (error) {
        if (error.code === 'VALIDATION_FAILED' && error.details) {
          helpers.setErrors(error.details);
        }
        setFailure(error.message);
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  async function cancelRun(runId) {
    setBusyRunId(runId);
    setFailure(null);
    try {
      await apiRequest(`/api/workforce/ai/runs/${runId}/cancel`, {
        method: 'POST',
      });
      refresh('Cancellation recorded.');
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusyRunId(null);
    }
  }

  const runDisabledReason = !agent.enabled
    ? 'This agent is disabled. Enable it before starting a run.'
    : !providerMeta?.configured
      ? `${providerMeta?.label || agent.provider} has no server credential, so runs cannot execute.`
      : null;

  return (
    <Page>
      <Link
        href="/workspace/ai-workforce"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>AI workforce</span>
      </Link>

      <Header>
        <Eyebrow>{typeMeta.label}</Eyebrow>
        <Title>{agent.name}</Title>
        <Row>
          <Badge $tone={agent.enabled ? 'success' : 'muted'}>
            {agent.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <Badge $tone={agent.approvalRequired ? 'warning' : 'muted'}>
            {agent.approvalRequired ? 'Approval required' : 'No approval gate'}
          </Badge>
          <Badge $tone={providerMeta?.configured ? 'info' : 'warning'}>
            {providerMeta?.label || agent.provider} · {agent.model}
          </Badge>
        </Row>
        {agent.description ? (
          <CardText>{agent.description}</CardText>
        ) : (
          <CardText>{typeMeta.description}</CardText>
        )}
      </Header>

      {notice ? <Notice $tone="success">{notice}</Notice> : null}
      {failure ? <Notice $tone="danger">{failure}</Notice> : null}
      {typeMeta.reviewNote ? (
        <Notice $tone="warning">{typeMeta.reviewNote}</Notice>
      ) : null}
      {!runtimeConfigured ? (
        <Notice $tone="warning">
          <CircleAlert size={15} />
          <span>
            AI execution is not configured on this server. You can prepare
            agents and exercise approvals, but runs will fail until an operator
            adds a provider API key to the environment.
          </span>
        </Notice>
      ) : null}

      <StatGrid>
        <StatCard>
          <StatLabel>Runs this month</StatLabel>
          <StatValue>{usage.runs}</StatValue>
          <StatNote>{usage.open} open now</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Completed</StatLabel>
          <StatValue>{usage.completed}</StatValue>
          <StatNote>{usage.failed} failed · {usage.cancelled} cancelled</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Tokens</StatLabel>
          <StatValue>{formatTokens(usage.tokens)}</StatValue>
          <StatNote>
            {agent.monthlyTokenLimit == null
              ? 'No agent limit'
              : `Limit ${formatTokens(agent.monthlyTokenLimit)}`}
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Estimated cost</StatLabel>
          <StatValue>{formatCents(usage.costCents)}</StatValue>
          <StatNote>
            {agent.monthlyBudgetCents == null
              ? 'No agent budget'
              : `Limit ${formatCents(agent.monthlyBudgetCents)}`}
          </StatNote>
        </StatCard>
      </StatGrid>

      <Grid $cols={2}>
        <Card id="run">
          <CardHead>
            <div>
              <CardTitle>Start a run</CardTitle>
              <CardText>
                The worker executes this in the background. Provider calls never
                run inside the web request.
              </CardText>
            </div>
            <Play size={16} aria-hidden="true" />
          </CardHead>

          {!canRun ? (
            <Hint>Your role can view agents but cannot start runs.</Hint>
          ) : runDisabledReason ? (
            <Notice $tone="warning">{runDisabledReason}</Notice>
          ) : (
            <form onSubmit={formik.handleSubmit}>
              <Stack $gap={12}>
                <Field>
                  <Label htmlFor="run-input">Task input</Label>
                  <Textarea
                    id="run-input"
                    name="input"
                    rows={6}
                    maxLength={20_000}
                    value={formik.values.input}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Describe the task, the context to use and what the output should contain."
                    disabled={formik.isSubmitting}
                  />
                  <Hint>
                    {formik.values.input.length} / 20,000 characters. Input is
                    stored with the run so the outcome can be reviewed.
                  </Hint>
                  {formik.touched.input && formik.errors.input ? (
                    <ErrorText>{formik.errors.input}</ErrorText>
                  ) : null}
                </Field>

                {agent.approvalRequired ? (
                  <Notice $tone="warning">
                    <ShieldCheck size={15} />
                    This run is created as awaiting approval. It starts only
                    after a reviewer approves it.
                  </Notice>
                ) : null}

                <Actions>
                  <Button
                    type="submit"
                    $variant="primary"
                    disabled={formik.isSubmitting}
                  >
                    {formik.isSubmitting ? (
                      <Loader2 size={15} className="spin" />
                    ) : (
                      <Play size={15} />
                    )}
                    Submit run
                  </Button>
                </Actions>

                {lastRun ? (
                  <Notice
                    $tone={
                      lastRun.status === 'failed'
                        ? 'danger'
                        : lastRun.status === 'awaiting_approval'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    <span>
                      Run created with status{' '}
                      <strong>{statusMeta(lastRun.status).label}</strong>.{' '}
                      <Link href={`/workspace/ai-workforce/runs/${lastRun.id}`}>
                        Open the run
                      </Link>
                    </span>
                  </Notice>
                ) : null}
              </Stack>
            </form>
          )}
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>Configuration</CardTitle>
              <CardText>
                Declared permissions and monthly limits for this agent.
              </CardText>
            </div>
            {canManage ? (
              editing ? (
                <Button
                  type="button"
                  $variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  <X size={14} />
                  Close editor
                </Button>
              ) : (
                <Button type="button" onClick={() => setEditing(true)}>
                  <Pencil size={14} />
                  Edit
                </Button>
              )
            ) : null}
          </CardHead>

          {editing ? (
            <AgentForm
              agent={agent}
              providers={providers}
              onDone={() => {
                setEditing(false);
                refresh('Agent settings saved.');
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <Stack $gap={14}>
              <Stack $gap={8}>
                <Label>Monthly token usage</Label>
                {limitRow('Tokens', usage.tokens, agent.monthlyTokenLimit, formatTokens)}
              </Stack>
              <Stack $gap={8}>
                <Label>Monthly budget usage</Label>
                {limitRow(
                  'Estimated cost',
                  usage.costCents,
                  agent.monthlyBudgetCents,
                  formatCents,
                )}
              </Stack>
              <Notice>
                <BadgeCheck size={15} />
                <span>
                  Tool permissions: {agent.toolPermissions.length
                    ? agent.toolPermissions.join(', ')
                    : 'none declared'}
                  . Workflows: {agent.allowedWorkflows.length
                    ? agent.allowedWorkflows.join(', ')
                    : 'none declared'}.
                </span>
              </Notice>
              <Hint>
                No tool executes automatically in this phase. Instructions cannot
                remove the guardrails added by the server.
              </Hint>
            </Stack>
          )}
        </Card>
      </Grid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Recent runs</CardTitle>
            <CardText>The latest runs for this agent in this workspace.</CardText>
          </div>
          <LinkButton href="/workspace/ai-workforce/runs">
            All workspace runs
          </LinkButton>
        </CardHead>

        {runs.length === 0 ? (
          <Hint>This agent has no runs yet.</Hint>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Requested by</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Duration</th>
                  <th>Started</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const meta = statusMeta(run.status);
                  return (
                    <tr key={run.id}>
                      <td>
                        <Link href={`/workspace/ai-workforce/runs/${run.id}`}>
                          <Badge $tone={meta.tone}>{meta.label}</Badge>
                        </Link>
                      </td>
                      <td>{run.requestedByName || run.requestedByEmail || '—'}</td>
                      <td>
                        {formatTokens(run.promptTokens + run.completionTokens)}
                      </td>
                      <td>{formatCents(run.costEstimateCents)}</td>
                      <td>{formatDuration(run.durationMs)}</td>
                      <td>{formatDateTime(run.createdAt, timezone)}</td>
                      <td>
                        {canRun && OPEN_STATUSES.includes(run.status) ? (
                          <Button
                            type="button"
                            $variant="danger"
                            disabled={busyRunId === run.id}
                            onClick={() => cancelRun(run.id)}
                            style={{ minHeight: 30, padding: '0 9px', fontSize: '0.72rem' }}
                          >
                            {busyRunId === run.id ? (
                              <Loader2 size={12} className="spin" />
                            ) : (
                              <Square size={12} />
                            )}
                            Cancel
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </Page>
  );
}
