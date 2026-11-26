'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, CircleAlert, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';
import styled from 'styled-components';
import { agentTypeLabel } from '@/lib/ai/agent-types';
import { apiRequest } from '@/lib/ai/client';
import {
  APPROVAL_STATUS_META,
  formatDateTime,
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
  EmptyState,
  Eyebrow,
  Field,
  Header,
  Hint,
  Label,
  Lead,
  Notice,
  Page,
  Row,
  Stack,
  Table,
  TableWrap,
  Textarea,
  Title,
} from './primitives';

const ItemGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
`;

const Item = styled.article`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
`;

function ApprovalItem({ approval, timezone, onDecided }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function decide(decision) {
    setBusy(decision);
    setError(null);
    try {
      const result = await apiRequest(
        `/api/workforce/ai/approvals/${approval.id}`,
        { method: 'POST', body: { decision, note: note.trim() || null } },
      );
      onDecided(result, decision);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(null);
    }
  }

  return (
    <Item>
      <Row>
        <Badge $tone="warning">Pending</Badge>
        <Badge $tone="muted">{agentTypeLabel(approval.agentType)}</Badge>
      </Row>
      <div>
        <CardTitle>{approval.agentName}</CardTitle>
        <CardText>
          Requested by{' '}
          {approval.requestedByName || approval.requestedByEmail || 'unknown'}
          {approval.requestedByName && approval.requestedByEmail
            ? ` (${approval.requestedByEmail})`
            : ''}{' '}
          on {formatDateTime(approval.createdAt, timezone)}.
        </CardText>
      </div>

      {approval.decisionNote ? (
        <Hint>Existing note: {approval.decisionNote}</Hint>
      ) : null}

      <Field>
        <Label htmlFor={`note-${approval.id}`}>Decision note (optional)</Label>
        <Textarea
          id={`note-${approval.id}`}
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why this run should or should not proceed."
          disabled={Boolean(busy)}
        />
        <Hint>{note.length} / 500 characters.</Hint>
      </Field>

      {error ? <Notice $tone="danger">{error}</Notice> : null}

      <Actions>
        <Button
          type="button"
          $variant="primary"
          onClick={() => decide('approve')}
          disabled={Boolean(busy)}
        >
          {busy === 'approve' ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <ThumbsUp size={14} />
          )}
          Approve
        </Button>
        <Button
          type="button"
          $variant="danger"
          onClick={() => decide('reject')}
          disabled={Boolean(busy)}
        >
          {busy === 'reject' ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <ThumbsDown size={14} />
          )}
          Reject
        </Button>
        <Link
          href={`/workspace/ai-workforce/runs/${approval.runId}`}
          style={{ fontSize: '0.78rem', fontWeight: 600 }}
        >
          Review run
        </Link>
      </Actions>
    </Item>
  );
}

export default function ApprovalsView({
  pending,
  history,
  runtimeConfigured,
  timezone,
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState(null);

  function handleDecided(result, decision) {
    if (result?.error) {
      setOutcome({
        tone: 'warning',
        message: `Decision recorded, but the run could not start: ${result.error}`,
      });
    } else {
      setOutcome({
        tone: 'success',
        message:
          decision === 'approve'
            ? 'Run approved and queued for execution.'
            : 'Run rejected. The requester can see the decision on the run.',
      });
    }
    router.refresh();
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Approvals</Eyebrow>
        <Title>Human review queue</Title>
        <Lead>
          Agents never take sensitive actions on their own. Every run that an
          owner marked as sensitive waits here until a reviewer approves or
          rejects it.
        </Lead>
      </Header>

      {!runtimeConfigured ? (
        <Notice $tone="warning">
          <CircleAlert size={15} />
          <span>
            AI execution is not configured on this server. Approving a run will
            record the decision, but the run will fail until a provider
            credential is added to the environment.
          </span>
        </Notice>
      ) : null}

      {outcome ? (
        <Notice $tone={outcome.tone}>{outcome.message}</Notice>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Awaiting decision</CardTitle>
            <CardText>
              {pending.length === 0
                ? 'Nothing is waiting for review.'
                : `${pending.length} run${pending.length === 1 ? '' : 's'} waiting for a human decision.`}
            </CardText>
          </div>
          <BadgeCheck size={16} aria-hidden="true" />
        </CardHead>

        {pending.length === 0 ? (
          <EmptyState>
            <div>
              <h3>Queue is clear</h3>
              <p>
                Runs that require approval appear here. Approving queues the run
                for the worker; rejecting cancels it.
              </p>
            </div>
          </EmptyState>
        ) : (
          <ItemGrid>
            {pending.map((approval) => (
              <ApprovalItem
                key={approval.id}
                approval={approval}
                timezone={timezone}
                onDecided={handleDecided}
              />
            ))}
          </ItemGrid>
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Decision history</CardTitle>
            <CardText>The most recent decided approvals in this workspace.</CardText>
          </div>
        </CardHead>

        {history.length === 0 ? (
          <Hint>No approvals have been decided yet.</Hint>
        ) : (
          <Stack $gap={12}>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Agent</th>
                    <th>Requested by</th>
                    <th>Decided</th>
                    <th>Note</th>
                    <th>Run</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((approval) => {
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
                        <td>{approval.agentName}</td>
                        <td>
                          {approval.requestedByName ||
                            approval.requestedByEmail ||
                            'Unknown'}
                        </td>
                        <td>{formatDateTime(approval.decidedAt, timezone)}</td>
                        <td>{approval.decisionNote || '—'}</td>
                        <td>
                          <Link
                            href={`/workspace/ai-workforce/runs/${approval.runId}`}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </Stack>
        )}
      </Card>
    </Page>
  );
}
