'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bot,
  CircleAlert,
  LifeBuoy,
  Loader2,
  MessageSquare,
  Pencil,
} from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import { formatDate, formatDateTime } from '@/lib/ai/format';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  Eyebrow,
  Field,
  Header,
  Hint,
  Label,
  Lead,
  Notice,
  Page,
  Select,
  Stack,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import {
  MetaGrid,
  Timeline,
  TimelineItem,
} from '@/components/workspace/phase2c/ui';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_META,
  TICKET_STATUS_META,
  TICKET_VISIBILITY_META,
  metaFor,
} from './meta';
import TicketForm from './TicketForm';

export default function TicketDetailView({
  detail,
  members,
  projects = [],
  timezone,
  permissions,
  canRunAi,
}) {
  const router = useRouter();
  const { ticket, messages, permissionsHints } = detail;
  const [editing, setEditing] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [nextStatus, setNextStatus] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [messageVisibility, setMessageVisibility] = useState('internal');
  const [messageBusy, setMessageBusy] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [showAi, setShowAi] = useState(false);

  const statusMeta = metaFor(TICKET_STATUS_META, ticket.status);
  const priorityMeta = metaFor(TICKET_PRIORITY_META, ticket.priority);
  const allowedStatuses = permissionsHints.canTransitionTo || [];

  function refresh() {
    router.refresh();
  }

  async function changeStatus() {
    if (!nextStatus) return;
    setStatusBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      await apiRequest(`/api/workforce/tickets/${ticket.id}/status`, {
        method: 'POST',
        body: {
          status: nextStatus,
          resolutionNotes: resolutionNotes.trim() || null,
        },
      });
      setNotice(`Ticket moved to ${TICKET_STATUS_META[nextStatus]?.label || nextStatus}.`);
      setNextStatus('');
      setResolutionNotes('');
      refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setStatusBusy(false);
    }
  }

  async function addMessage() {
    if (!messageBody.trim()) return;
    setMessageBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      await apiRequest(`/api/workforce/tickets/${ticket.id}/messages`, {
        method: 'POST',
        body: { body: messageBody.trim(), visibility: messageVisibility },
      });
      setNotice('Message recorded.');
      setMessageBody('');
      setMessageVisibility('internal');
      refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setMessageBusy(false);
    }
  }

  async function requestDraft() {
    setAiBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      const result = await apiRequest(`/api/workforce/tickets/${ticket.id}/ai-draft`, {
        method: 'POST',
        body: { instruction: aiInstruction.trim() || null },
      });
      setNotice(
        `AI draft queued with ${result.agent?.name || 'an assistant'}. Nothing is sent automatically.`,
      );
      setShowAi(false);
      setAiInstruction('');
    } catch (error) {
      setFailure(error.message);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/support">Support</Link> · {ticket.reference}
        </Eyebrow>
        <Title>{ticket.subject}</Title>
        <Lead>
          <Link href={`/workspace/clients/${ticket.clientId}`}>
            {ticket.companyName}
          </Link>
          {ticket.projectReference ? ` · ${ticket.projectReference}` : ''} ·{' '}
          {TICKET_CATEGORY_LABELS[ticket.category] || ticket.category}
        </Lead>
      </Header>

      <Stack $gap={10}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Badge $tone={statusMeta.tone}>{statusMeta.label}</Badge>
          <Badge $tone={priorityMeta.tone}>{priorityMeta.label} priority</Badge>
          {ticket.isOverdue ? <Badge $tone="danger">Overdue</Badge> : null}
          {ticket.isDueToday ? <Badge $tone="warning">Due today</Badge> : null}
          {permissions.canEdit ? (
            <Button type="button" $variant="ghost" onClick={() => setEditing((v) => !v)}>
              <Pencil size={14} />
              {editing ? 'Close editor' : 'Edit ticket'}
            </Button>
          ) : null}
          {canRunAi ? (
            <Button type="button" $variant="ghost" onClick={() => setShowAi((v) => !v)}>
              <Bot size={14} />
              {showAi ? 'Close AI draft' : 'AI reply draft'}
            </Button>
          ) : null}
        </div>

        {failure ? <Notice $tone="danger">{failure}</Notice> : null}
        {notice ? <Notice $tone="success">{notice}</Notice> : null}
      </Stack>

      {editing ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Edit ticket</CardTitle>
              <CardText>Client and history stay attached to this record.</CardText>
            </div>
            <LifeBuoy size={16} aria-hidden="true" />
          </CardHead>
          <TicketForm
            ticket={ticket}
            projects={projects}
            members={members}
            fixedClientId={ticket.clientId}
            onDone={() => {
              setEditing(false);
              setNotice('Ticket saved.');
              refresh();
            }}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : null}

      {showAi && canRunAi ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>AI reply draft</CardTitle>
              <CardText>
                Drafts text for an agent to review. It never sends messages,
                promises dates or changes the ticket.
              </CardText>
            </div>
            <Bot size={16} aria-hidden="true" />
          </CardHead>
          <Stack $gap={10}>
            <Field>
              <Label htmlFor="ticket-ai-focus">Focus (optional)</Label>
              <Textarea
                id="ticket-ai-focus"
                value={aiInstruction}
                onChange={(event) => setAiInstruction(event.target.value)}
                maxLength={1_000}
                style={{ minHeight: 60 }}
                disabled={aiBusy}
              />
            </Field>
            <Actions>
              <Button type="button" $variant="primary" onClick={requestDraft} disabled={aiBusy}>
                {aiBusy ? <Loader2 size={14} className="spin" /> : <Bot size={14} />}
                {aiBusy ? 'Queuing…' : 'Draft reply'}
              </Button>
            </Actions>
          </Stack>
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Ticket details</CardTitle>
            <CardText>Ownership, timing and classification.</CardText>
          </div>
          <LifeBuoy size={16} aria-hidden="true" />
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Reference</dt>
            <dd>{ticket.reference}</dd>
          </div>
          <div>
            <dt>Client</dt>
            <dd>
              <Link href={`/workspace/clients/${ticket.clientId}`}>
                {ticket.companyName}
              </Link>
            </dd>
          </div>
          <div>
            <dt>Project</dt>
            <dd>
              {ticket.projectId ? (
                <Link href={`/workspace/projects/${ticket.projectId}`}>
                  {ticket.projectReference}
                </Link>
              ) : (
                'No project link'
              )}
            </dd>
          </div>
          <div>
            <dt>Assignee</dt>
            <dd>{ticket.assigneeName || 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{TICKET_CATEGORY_LABELS[ticket.category] || ticket.category}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{priorityMeta.label}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{formatDate(ticket.dueDate, timezone)}</dd>
          </div>
          <div>
            <dt>Opened</dt>
            <dd>{formatDateTime(ticket.createdAt, timezone)}</dd>
          </div>
          <div>
            <dt>Resolved</dt>
            <dd>{formatDateTime(ticket.resolvedAt, timezone)}</dd>
          </div>
        </MetaGrid>
        {ticket.description ? (
          <>
            <CardTitle as="h3">Description</CardTitle>
            <CardText style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</CardText>
          </>
        ) : null}
        {ticket.resolutionNotes ? (
          <>
            <CardTitle as="h3">Resolution notes</CardTitle>
            <CardText style={{ whiteSpace: 'pre-wrap' }}>
              {ticket.resolutionNotes}
            </CardText>
          </>
        ) : null}
      </Card>

      {permissions.canEdit && allowedStatuses.length > 0 ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Controlled status flow</CardTitle>
              <CardText>
                Only allowed next states are offered. Resolving records a
                timestamp; reopening clears it.
              </CardText>
            </div>
            <LifeBuoy size={16} aria-hidden="true" />
          </CardHead>
          <Stack $gap={10}>
            <Field>
              <Label htmlFor="ticket-next-status">Next status</Label>
              <Select
                id="ticket-next-status"
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value)}
                disabled={statusBusy}
              >
                <option value="">Choose a status</option>
                {allowedStatuses.map((status) => (
                  <option key={status} value={status}>
                    {TICKET_STATUS_META[status]?.label || status}
                  </option>
                ))}
              </Select>
              <Hint>
                Allowed from {statusMeta.label}:{' '}
                {allowedStatuses
                  .map((status) => TICKET_STATUS_META[status]?.label || status)
                  .join(', ')}
              </Hint>
            </Field>
            <Field>
              <Label htmlFor="ticket-resolution">Resolution notes (optional)</Label>
              <Textarea
                id="ticket-resolution"
                value={resolutionNotes}
                onChange={(event) => setResolutionNotes(event.target.value)}
                maxLength={4_000}
                style={{ minHeight: 60 }}
                disabled={statusBusy}
              />
            </Field>
            <Actions>
              <Button
                type="button"
                $variant="primary"
                onClick={changeStatus}
                disabled={statusBusy || !nextStatus}
              >
                {statusBusy ? <Loader2 size={14} className="spin" /> : null}
                {statusBusy ? 'Updating…' : 'Update status'}
              </Button>
            </Actions>
          </Stack>
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Conversation</CardTitle>
            <CardText>
              Internal notes and client-visible comments are stored separately and
              labelled. This system does not send email.
            </CardText>
          </div>
          <MessageSquare size={16} aria-hidden="true" />
        </CardHead>

        {messages.length === 0 ? (
          <CardText>No messages recorded yet.</CardText>
        ) : (
          <Timeline>
            {messages.map((message) => {
              const visibility = metaFor(TICKET_VISIBILITY_META, message.visibility);
              return (
                <TimelineItem
                  key={message.id}
                  $tone={message.visibility === 'internal' ? 'warning' : 'success'}
                >
                  <strong>
                    {message.authorName || 'Team member'} ·{' '}
                    <Badge $tone={visibility.tone}>{visibility.label}</Badge>
                  </strong>
                  <p>{message.body}</p>
                  <span>{formatDateTime(message.createdAt, timezone)}</span>
                </TimelineItem>
              );
            })}
          </Timeline>
        )}

        {permissions.canEdit ? (
          <Stack $gap={10}>
            <Field>
              <Label htmlFor="ticket-message">Add a message</Label>
              <Textarea
                id="ticket-message"
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                maxLength={8_000}
                style={{ minHeight: 80 }}
                disabled={messageBusy}
              />
            </Field>
            <Field>
              <Label htmlFor="ticket-visibility">Visibility</Label>
              <Select
                id="ticket-visibility"
                value={messageVisibility}
                onChange={(event) => setMessageVisibility(event.target.value)}
                disabled={messageBusy}
              >
                <option value="internal">Internal note</option>
                <option value="client">Client-visible</option>
              </Select>
              <Hint>
                A client-visible comment is recorded for sharing; it is not
                transmitted by this system.
              </Hint>
            </Field>
            <Actions>
              <Button
                type="button"
                onClick={addMessage}
                disabled={messageBusy || !messageBody.trim()}
              >
                {messageBusy ? <Loader2 size={14} className="spin" /> : <MessageSquare size={14} />}
                {messageBusy ? 'Recording…' : 'Record message'}
              </Button>
            </Actions>
          </Stack>
        ) : null}
      </Card>

      <Hint>
        <CircleAlert size={12} aria-hidden="true" /> Internal notes are never
        exposed as client-visible content. No message here implies an email, call
        or commitment was made.
      </Hint>
    </Page>
  );
}
