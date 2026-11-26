'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CircleAlert,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import styled from 'styled-components';
import { agentTypeLabel } from '@/lib/ai/agent-types';
import { apiRequest } from '@/lib/ai/client';
import {
  APPROVAL_STATUS_META,
  formatCents,
  formatDateTime,
  formatDuration,
  formatTokens,
  statusMeta,
} from '@/lib/ai/format';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  Eyebrow,
  Header,
  Hint,
  LinkButton,
  Mono,
  Notice,
  Page,
  Pre,
  Row,
  Stack,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
} from './primitives';

const OPEN_STATUSES = ['queued', 'running', 'awaiting_approval'];

const MetaList = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px 18px;

  div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  dt {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.muted};
  }

  dd {
    margin: 0;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.textSoft};
    word-break: break-word;
  }
`;

const LogList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding-bottom: 10px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }

  li:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
`;

const LogBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  p {
    font-size: 0.8rem;
    line-height: 1.55;
    color: ${({ theme }) => theme.colors.textSoft};
    word-break: break-word;
  }

  span {
    font-size: 0.7rem;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

function levelTone(level) {
  return LOG_TONE[level] || 'muted';
}

const LOG_TONE = { error: 'danger', warn: 'warning', info: 'muted' };

const PROVENANCE_TONE = {
  verified: 'success',
  source_derived: 'muted',
  ai_generated: 'warning',
  unverified: 'warning',
};

function sourceType(source) {
  if (source.kind === 'memory') {
    return `${source.memoryType || 'memory'} memory`;
  }
  if (source.kind === 'entity') {
    return `${source.entityType || 'record'}`;
  }
  return source.category || 'knowledge';
}

function sourceStatus(source) {
  if (source.kind === 'memory') {
    return source.verified
      ? { label: `verified · ${source.confidence || 'medium'}`, tone: 'success' }
      : { label: `${source.confidence || 'medium'} confidence`, tone: 'warning' };
  }
  if (source.provenance) {
    return {
      label: source.provenance.replace(/_/g, ' '),
      tone: PROVENANCE_TONE[source.provenance] || 'muted',
    };
  }
  return { label: source.kind === 'entity' ? 'live record' : 'recorded', tone: 'muted' };
}

export default function RunDetailView({ detail, canRun, timezone }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);

  const { run, agentName, agentType, requestedByName, requestedByEmail, logs, approvals } =
    detail;
  const meta = statusMeta(run.status);
  const isOpen = OPEN_STATUSES.includes(run.status);

  // A queued or running job changes on the server without a page action, so the
  // view re-reads it while it is open.
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [isOpen, router]);

  async function cancelRun() {
    setBusy(true);
    setFailure(null);
    try {
      const data = await apiRequest(
        `/api/workforce/ai/runs/${run.id}/cancel`,
        { method: 'POST' },
      );
      setNotice(
        data.deferred
          ? 'Cancellation requested. The worker stops at its next check.'
          : 'Run cancelled.',
      );
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }

  const outputText = run.output?.text || null;
  const toolCalls = Array.isArray(run.output?.toolCalls)
    ? run.output.toolCalls
    : [];

  return (
    <Page>
      <Link
        href="/workspace/ai-workforce/runs"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>Agent runs</span>
      </Link>

      <Header>
        <Eyebrow>{agentTypeLabel(agentType)}</Eyebrow>
        <Title>{agentName}</Title>
        <Row>
          <Badge $tone={meta.tone}>{meta.label}</Badge>
          <Mono>{run.id}</Mono>
        </Row>
        {run.status === 'awaiting_approval' ? (
          <Hint>
            This run will start only after a reviewer decides. Open the{' '}
            <Link href="/workspace/approvals">approval queue</Link>.
          </Hint>
        ) : null}
      </Header>

      {notice ? <Notice $tone="success">{notice}</Notice> : null}
      {failure ? <Notice $tone="danger">{failure}</Notice> : null}
      {run.errorMessage ? (
        <Notice $tone={run.status === 'cancelled' ? 'warning' : 'danger'}>
          <CircleAlert size={15} />
          <span>{run.errorMessage}</span>
        </Notice>
      ) : null}

      <Actions>
        <Button type="button" $variant="ghost" onClick={() => router.refresh()}>
          <RefreshCw size={14} />
          Refresh
        </Button>
        <LinkButton href={`/workspace/ai-workforce/agents/${run.agentId}`}>
          Open agent
        </LinkButton>
        {canRun && isOpen ? (
          <Button type="button" $variant="danger" onClick={cancelRun} disabled={busy}>
            {busy ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Square size={14} />
            )}
            {run.status === 'running' ? 'Request cancellation' : 'Cancel run'}
          </Button>
        ) : null}
      </Actions>

      <StatGrid>
        <StatCard>
          <StatLabel>Tokens</StatLabel>
          <StatValue>
            {formatTokens(run.promptTokens + run.completionTokens)}
          </StatValue>
          <StatNote>
            {formatTokens(run.promptTokens)} in ·{' '}
            {formatTokens(run.completionTokens)} out
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Estimated cost</StatLabel>
          <StatValue>{formatCents(run.costEstimateCents)}</StatValue>
          <StatNote>Based on recorded token usage</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Duration</StatLabel>
          <StatValue>{formatDuration(run.durationMs)}</StatValue>
          <StatNote>{run.attempts} execution attempt(s)</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Approval</StatLabel>
          <StatValue>{run.approvalRequired ? 'Required' : 'Not required'}</StatValue>
          <StatNote>{approvals.length} decision record(s)</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <CardTitle>Run details</CardTitle>
        </CardHead>
        <MetaList>
          <div>
            <dt>Requested by</dt>
            <dd>
              {requestedByName || requestedByEmail || 'Unknown'}
              {requestedByName && requestedByEmail ? ` · ${requestedByEmail}` : ''}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDateTime(run.createdAt, timezone)}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{formatDateTime(run.startedAt, timezone)}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{formatDateTime(run.completedAt, timezone)}</dd>
          </div>
          <div>
            <dt>Cancellation requested</dt>
            <dd>{run.cancelRequested ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Queue job</dt>
            <dd>{run.jobId ? <Mono>{run.jobId}</Mono> : 'Not queued'}</dd>
          </div>
        </MetaList>
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Input</CardTitle>
            <CardText>The task the agent was asked to perform.</CardText>
          </div>
        </CardHead>
        <Pre>{run.input?.prompt || '(no input recorded)'}</Pre>
      </Card>

      {run.contextSources ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Workspace context</CardTitle>
              <CardText>
                Knowledge, memory and related records attached to this task.
                Retrieved content is reference data, never instructions or
                authorisation.
              </CardText>
            </div>
            <Badge $tone={run.contextSources.hasContext ? 'success' : 'muted'}>
              {run.contextSources.hasContext ? 'Context attached' : 'No context'} ·{' '}
              {formatTokens(run.contextTokens)} tokens
            </Badge>
          </CardHead>
          <MetaList>
            <div>
              <dt>Knowledge entries</dt>
              <dd>{run.contextSources.counts?.entries || 0}</dd>
            </div>
            <div>
              <dt>Document chunks</dt>
              <dd>{run.contextSources.counts?.chunks || 0}</dd>
            </div>
            <div>
              <dt>AI memories</dt>
              <dd>{run.contextSources.counts?.memories || 0}</dd>
            </div>
            <div>
              <dt>Related records</dt>
              <dd>{run.contextSources.counts?.entities || 0}</dd>
            </div>
          </MetaList>
          {run.contextSources.notes?.length ? (
            <Stack $gap={4}>
              {run.contextSources.notes.map((note) => (
                <Hint key={note}>{note}</Hint>
              ))}
            </Stack>
          ) : null}
          {run.contextSources.sources?.length ? (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Label</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {run.contextSources.sources.map((source) => {
                    const status = sourceStatus(source);
                    return (
                      <tr key={`${source.kind}:${source.id}:${source.chunkIndex ?? ''}`}>
                        <td>{source.kind === 'chunk' ? `chunk ${source.chunkIndex + 1}` : source.kind}</td>
                        <td>{source.label || '—'}</td>
                        <td>{sourceType(source)}</td>
                        <td>
                          <Badge $tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td>{source.sourceReference || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          ) : (
            <Hint>
              No workspace knowledge or memory matched this task. The agent was
              told to say so instead of inventing facts.
            </Hint>
          )}
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Output</CardTitle>
            <CardText>
              {outputText
                ? 'Recorded model response. Review before relying on it.'
                : 'Output is available after a successful completion.'}
            </CardText>
          </div>
          {run.output ? (
            <Badge $tone="success">
              {run.output.provider} · {run.output.model}
            </Badge>
          ) : null}
        </CardHead>
        {outputText ? (
          <Pre>{outputText}</Pre>
        ) : (
          <Hint>
            {run.status === 'failed'
              ? 'The run failed before producing output. The error above and the logs below record why.'
              : run.status === 'cancelled'
                ? 'The run was cancelled before producing output.'
                : 'Nothing has been recorded yet.'}
          </Hint>
        )}
        {toolCalls.length ? (
          <Stack $gap={8}>
            <CardTitle>Tool calls</CardTitle>
            <Pre>{JSON.stringify(toolCalls, null, 2)}</Pre>
          </Stack>
        ) : null}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Execution logs</CardTitle>
            <CardText>
              {logs.length} {logs.length === 1 ? 'entry' : 'entries'} recorded by
              the runtime and worker.
            </CardText>
          </div>
        </CardHead>
        {logs.length === 0 ? (
          <Hint>No log entries were recorded for this run.</Hint>
        ) : (
          <LogList>
            {logs.map((log) => (
              <li key={log.id}>
                <Badge $tone={levelTone(log.level)}>
                  {log.level}
                </Badge>
                <LogBody>
                  <p>{log.message}</p>
                  <span>{formatDateTime(log.createdAt, timezone)}</span>
                </LogBody>
              </li>
            ))}
          </LogList>
        )}
      </Card>

      {approvals.length ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Approval history</CardTitle>
              <CardText>Human decisions recorded for this run.</CardText>
            </div>
            <ShieldCheck size={16} aria-hidden="true" />
          </CardHead>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Decided</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((approval) => {
                  const approvalMeta = statusMeta(
                    approval.status,
                    APPROVAL_STATUS_META,
                  );
                  return (
                    <tr key={approval.id}>
                      <td>
                        <Badge $tone={approvalMeta.tone}>
                          {approvalMeta.label}
                        </Badge>
                      </td>
                      <td>{formatDateTime(approval.createdAt, timezone)}</td>
                      <td>{formatDateTime(approval.decidedAt, timezone)}</td>
                      <td>{approval.decisionNote || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      ) : null}
    </Page>
  );
}
