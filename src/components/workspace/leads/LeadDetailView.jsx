'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  BadgeCheck,
  CircleAlert,
  Loader2,
  Pencil,
  RotateCcw,
  Search,
  Send,
  Target,
  Users,
  X,
} from 'lucide-react';
import { formatDateTime } from '@/lib/ai/format';
import { apiRequest } from '@/lib/ai/client';
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
  Lead,
  Label,
  LinkButton,
  Notice,
  Page,
  Row,
  Select,
  Stack,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import {
  MetaGrid,
  SmallButton,
  SmallLink,
  Subhead,
  Timeline,
  TimelineItem,
  TwoCol,
} from '@/components/workspace/phase2c/ui';
import {
  ACTIVITY_LABELS,
  LEAD_PRIORITY_META,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_META,
  formatValue,
  isOverdue,
  metaFor,
} from '@/components/workspace/phase2c/meta';
import { OPPORTUNITY_STAGE_META } from '@/components/workspace/phase2d/meta';
import LeadForm from './LeadForm';
import ReportedAmountsForm from './ReportedAmountsForm';
import ConversionForm from './ConversionForm';

const TIMELINE_SOURCE_LABELS = {
  lead: 'Lead',
  meeting: 'Meeting',
  task: 'Follow-up',
  client: 'Client',
  project: 'Project',
  finance: 'Finance',
};

const TIMELINE_SOURCE_TONE = {
  lead: 'info',
  meeting: 'success',
  task: 'warning',
  client: 'success',
  project: 'info',
  finance: 'muted',
};

function formatReportedCents(value, currency) {
  if (value === null || value === undefined) return '—';
  const amount = Number(value) / 100;
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || ''} ${amount.toFixed(2)}`.trim();
  }
}

function websiteHref(value) {
  if (!value) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

export default function LeadDetailView({
  detail,
  members,
  conversion,
  timeline,
  canConvert,
  canUpdate,
  canAssign,
  canArchive,
  canCreateResearch,
  canViewOpportunities,
  canCreateOpportunities,
  timezone,
}) {
  const router = useRouter();
  const { lead, statusHistory, possibleDuplicates, allowedTransitions } = detail;
  const opportunities = detail.opportunities || [];
  const timelineItems = timeline?.items || [];

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [statusTarget, setStatusTarget] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [assignment, setAssignment] = useState(lead.assignedUserId || '');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [noteBody, setNoteBody] = useState('');

  const archived = Boolean(lead.archivedAt);
  const status = metaFor(LEAD_STATUS_META, lead.status);
  const priority = metaFor(LEAD_PRIORITY_META, lead.priority);

  function resetMessages() {
    setFailure(null);
  }

  async function runAction(key, action, message) {
    setBusy(key);
    resetMessages();
    try {
      await action();
      if (message) setNotice(message);
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus() {
    await runAction(
      'status',
      async () => {
        await apiRequest(`/api/workforce/leads/${lead.id}/status`, {
          method: 'POST',
          body: { status: statusTarget, note: statusNote.trim() || null },
        });
        setConfirmStatus(false);
        setStatusTarget('');
        setStatusNote('');
      },
      `Status moved to ${metaFor(LEAD_STATUS_META, statusTarget).label}.`,
    );
  }

  async function saveAssignment() {
    await runAction(
      'assign',
      () =>
        apiRequest(`/api/workforce/leads/${lead.id}/assign`, {
          method: 'POST',
          body: { assignedUserId: assignment || null },
        }),
      'Owner updated.',
    );
  }

  async function toggleArchive() {
    await runAction(
      'archive',
      async () => {
        await apiRequest(`/api/workforce/leads/${lead.id}/archive`, {
          method: 'POST',
          body: { archived: !archived },
        });
        setConfirmArchive(false);
      },
      archived ? 'Lead restored.' : 'Lead archived.',
    );
  }

  async function addNote(event) {
    event.preventDefault();
    if (noteBody.trim().length < 2) {
      setFailure('Write at least two characters before saving the note.');
      return;
    }
    await runAction(
      'note',
      async () => {
        await apiRequest(`/api/workforce/leads/${lead.id}/notes`, {
          method: 'POST',
          body: { body: noteBody.trim() },
        });
        setNoteBody('');
      },
      'Note added to the timeline.',
    );
  }

  return (
    <Page>
      <Row>
        <SmallLink href="/workspace/leads">← All leads</SmallLink>
        {archived ? <Badge $tone="muted">Archived</Badge> : null}
      </Row>

      <Header>
        <Eyebrow>Lead</Eyebrow>
        <Title>{lead.companyName}</Title>
        <Row>
          <Badge $tone={status.tone}>{status.label}</Badge>
          <Badge $tone={priority.tone}>{priority.label} priority</Badge>
          {lead.contactName ? (
            <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
              {lead.contactName}
            </span>
          ) : null}
        </Row>
        <Lead>
          Created {formatDateTime(lead.createdAt, timezone)} · Last updated{' '}
          {formatDateTime(lead.updatedAt, timezone)}
        </Lead>
      </Header>

      {notice ? (
        <Notice $tone="success">
          <BadgeCheck size={15} />
          {notice}
        </Notice>
      ) : null}
      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          {failure}
        </Notice>
      ) : null}
      {archived ? (
        <Notice $tone="warning">
          <Archive size={15} />
          This lead is archived. Restore it before editing, changing status or
          adding notes.
        </Notice>
      ) : null}

      <Row>
        {canUpdate && !archived ? (
          <Button
            type="button"
            onClick={() => {
              setEditing((current) => !current);
              resetMessages();
            }}
          >
            {editing ? <X size={15} /> : <Pencil size={15} />}
            {editing ? 'Close editor' : 'Edit details'}
          </Button>
        ) : null}
        {canCreateResearch ? (
          <LinkButton href={`/workspace/research?lead=${lead.id}`}>
            <Search size={14} />
            Start research
          </LinkButton>
        ) : null}
        {canCreateOpportunities ? (
          <LinkButton href={`/workspace/opportunities?lead=${lead.id}`}>
            <Target size={14} />
            New opportunity
          </LinkButton>
        ) : null}
        {canArchive ? (
          <Button
            type="button"
            $variant={archived ? 'primary' : 'danger'}
            onClick={() => setConfirmArchive(true)}
            disabled={busy === 'archive'}
          >
            {busy === 'archive' ? (
              <Loader2 size={14} className="spin" />
            ) : archived ? (
              <RotateCcw size={14} />
            ) : (
              <Archive size={14} />
            )}
            {archived ? 'Restore lead' : 'Archive lead'}
          </Button>
        ) : null}
      </Row>

      {confirmArchive ? (
        <Notice $tone={archived ? 'info' : 'danger'}>
          <span>
            {archived
              ? 'Restore this lead to the active pipeline?'
              : 'Archive this lead? It leaves the active pipeline but keeps its history and can be restored.'}
          </span>
          <Row>
            <SmallButton
              type="button"
              $variant={archived ? 'primary' : 'danger'}
              onClick={toggleArchive}
              disabled={busy === 'archive'}
            >
              {archived ? 'Confirm restore' : 'Confirm archive'}
            </SmallButton>
            <SmallButton
              type="button"
              $variant="ghost"
              onClick={() => setConfirmArchive(false)}
            >
              Cancel
            </SmallButton>
          </Row>
        </Notice>
      ) : null}

      {editing ? (
        <Card>
          <CardHead>
            <CardTitle>Edit lead details</CardTitle>
          </CardHead>
          <LeadForm
            lead={lead}
            members={members}
            canAssign={false}
            onDone={() => {
              setEditing(false);
              setNotice('Lead details saved.');
              router.refresh();
            }}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Details</CardTitle>
            <CardText>Contact, commercial and scheduling information.</CardText>
          </div>
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Contact</dt>
            <dd>{lead.contactName || '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              {lead.email ? (
                <a href={`mailto:${lead.email}`}>{lead.email}</a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{lead.phone || '—'}</dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd>
              {lead.website ? (
                <a
                  href={websiteHref(lead.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {lead.website}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Industry</dt>
            <dd>{lead.industry || '—'}</dd>
          </div>
          <div>
            <dt>Business type</dt>
            <dd>{lead.businessType || '—'}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{[lead.location, lead.country].filter(Boolean).join(', ') || '—'}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{LEAD_SOURCE_LABELS[lead.source] || lead.source}</dd>
          </div>
          <div>
            <dt>Estimated value</dt>
            <dd>
              {lead.estimatedValueCents == null
                ? '—'
                : formatValue(lead.estimatedValueCents, lead.currency)}
            </dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{lead.assignedName || lead.assignedEmail || 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Next follow-up</dt>
            <dd>
              {formatDateTime(lead.nextFollowUpAt, timezone)}{' '}
              {isOverdue(lead.nextFollowUpAt) ? (
                <Badge $tone="danger">Overdue</Badge>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Archived</dt>
            <dd>{lead.archivedAt ? formatDateTime(lead.archivedAt, timezone) : 'No'}</dd>
          </div>
        </MetaGrid>
        {lead.notes ? (
          <>
            <Subhead>Notes on the record</Subhead>
            <CardText style={{ whiteSpace: 'pre-wrap' }}>{lead.notes}</CardText>
          </>
        ) : null}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Reported amounts</CardTitle>
            <CardText>
              Figures the owner reported. They are not verified payments and are
              never treated as invoice or proposal totals.
            </CardText>
          </div>
          <Badge $tone={lead.reportedAmountVerified ? 'success' : 'warning'}>
            {lead.reportedAmountVerified ? 'Marked verified' : 'Not verified'}
          </Badge>
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Amount received</dt>
            <dd>
              {formatReportedCents(
                lead.reportedAmountReceivedCents,
                lead.currency,
              )}
            </dd>
          </div>
          <div>
            <dt>Outstanding</dt>
            <dd>
              {formatReportedCents(
                lead.reportedOutstandingCents,
                lead.currency,
              )}
            </dd>
          </div>
          <div>
            <dt>Project cost</dt>
            <dd>
              {formatReportedCents(
                lead.reportedProjectCostCents,
                lead.currency,
              )}
            </dd>
          </div>
        </MetaGrid>
        {canUpdate && !archived ? (
          <>
            <Subhead>Update reported amounts</Subhead>
            <ReportedAmountsForm
              lead={lead}
              onDone={() => {
                setNotice('Reported amounts saved.');
                router.refresh();
              }}
            />
          </>
        ) : (
          <Hint>
            Reported amounts can be changed by a member with lead update access.
          </Hint>
        )}
      </Card>

      {canConvert && !archived ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Client and project conversion</CardTitle>
              <CardText>
                A won lead converts once. The client keeps the link to this lead,
                and reported amounts carry across as unverified figures.
              </CardText>
            </div>
            <Badge
              $tone={
                conversion?.client
                  ? 'success'
                  : conversion?.eligible
                    ? 'warning'
                    : 'muted'
              }
            >
              {conversion?.client
                ? 'Converted'
                : conversion?.eligible
                  ? 'Ready to convert'
                  : 'Not won'}
            </Badge>
          </CardHead>

          {conversion?.client ? (
            <Stack $gap={10}>
              <CardText>
                Client{' '}
                <Link href={`/workspace/clients/${conversion.client.id}`}>
                  {conversion.client.reference} ·{' '}
                  {conversion.client.companyName}
                </Link>{' '}
                ({conversion.client.status}) already exists for this lead.
              </CardText>
              {conversion.projects.length > 0 ? (
                <>
                  <Subhead>Projects</Subhead>
                  <Stack $gap={6}>
                    {conversion.projects.map((project) => (
                      <Row key={project.id}>
                        <Link
                          href={`/workspace/projects/${project.id}`}
                          style={{ fontWeight: 600, fontSize: '0.82rem' }}
                        >
                          {project.reference} · {project.name}
                        </Link>
                        <Badge $tone="muted">{project.status}</Badge>
                      </Row>
                    ))}
                  </Stack>
                </>
              ) : (
                <Hint>No project is linked to this lead yet.</Hint>
              )}
            </Stack>
          ) : conversion?.eligible ? (
            <ConversionForm
              leadId={lead.id}
              proposals={conversion.proposals}
              currency={lead.currency}
              onDone={(result) => {
                setNotice(
                  `Converted to client ${result.client.reference}${
                    result.project ? ` and project ${result.project.reference}` : ''
                  }.`,
                );
                router.refresh();
              }}
            />
          ) : (
            <Hint>
              Move this lead to Won before converting it. Current stage:{' '}
              {status.label}.
            </Hint>
          )}
        </Card>
      ) : null}

      {canAssign || canUpdate ? (
        <TwoCol>
          {canUpdate && !archived ? (
            <Card>
              <CardHead>
                <div>
                  <CardTitle>Pipeline stage</CardTitle>
                  <CardText>
                    Only allowed transitions are offered. Each change is written
                    to the status history.
                  </CardText>
                </div>
              </CardHead>
              {allowedTransitions.length === 0 ? (
                <Hint>No further transitions are available from this stage.</Hint>
              ) : (
                <Stack $gap={12}>
                  <Field>
                    <Label htmlFor="lead-next-status">Move to</Label>
                    <Select
                      id="lead-next-status"
                      value={statusTarget}
                      onChange={(event) => {
                        setStatusTarget(event.target.value);
                        setConfirmStatus(false);
                      }}
                      disabled={busy === 'status'}
                    >
                      <option value="">Choose a stage</option>
                      {allowedTransitions.map((next) => (
                        <option key={next} value={next}>
                          {metaFor(LEAD_STATUS_META, next).label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <Label htmlFor="lead-status-note">Note (optional)</Label>
                    <Textarea
                      id="lead-status-note"
                      value={statusNote}
                      onChange={(event) => setStatusNote(event.target.value)}
                      maxLength={500}
                      style={{ minHeight: 70 }}
                      disabled={busy === 'status'}
                    />
                  </Field>
                  {confirmStatus ? (
                    <Notice $tone="info">
                      <span>
                        Move this lead from {status.label} to{' '}
                        <strong>
                          {metaFor(LEAD_STATUS_META, statusTarget).label}
                        </strong>
                        ?
                      </span>
                      <Row>
                        <SmallButton
                          type="button"
                          $variant="primary"
                          onClick={changeStatus}
                          disabled={busy === 'status'}
                        >
                          {busy === 'status' ? (
                            <Loader2 size={13} className="spin" />
                          ) : null}
                          Confirm change
                        </SmallButton>
                        <SmallButton
                          type="button"
                          $variant="ghost"
                          onClick={() => setConfirmStatus(false)}
                        >
                          Cancel
                        </SmallButton>
                      </Row>
                    </Notice>
                  ) : (
                    <Actions>
                      <Button
                        type="button"
                        disabled={!statusTarget || busy === 'status'}
                        onClick={() => setConfirmStatus(true)}
                      >
                        Change status
                      </Button>
                    </Actions>
                  )}
                </Stack>
              )}

              <Subhead>Add a note</Subhead>
              <form onSubmit={addNote}>
                <Stack $gap={8}>
                  <Textarea
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    placeholder="Call summary, next step, objection…"
                    maxLength={5_000}
                    style={{ minHeight: 80 }}
                    disabled={busy === 'note'}
                  />
                  <Actions>
                    <Button
                      type="submit"
                      disabled={busy === 'note' || noteBody.trim().length < 2}
                    >
                      {busy === 'note' ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      Add note
                    </Button>
                  </Actions>
                </Stack>
              </form>
            </Card>
          ) : null}

          {canAssign ? (
            <Card>
              <CardHead>
                <div>
                  <CardTitle>Owner</CardTitle>
                  <CardText>
                    Assignment is limited to workspace members. Changes are
                    recorded in the activity timeline.
                  </CardText>
                </div>
              </CardHead>
              <Field>
                <Label htmlFor="lead-owner">Assigned to</Label>
                <Select
                  id="lead-owner"
                  value={assignment}
                  onChange={(event) => setAssignment(event.target.value)}
                  disabled={archived || busy === 'assign'}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name || member.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <Actions>
                <SmallButton
                  type="button"
                  onClick={saveAssignment}
                  disabled={
                    archived ||
                    busy === 'assign' ||
                    (assignment || '') === (lead.assignedUserId || '')
                  }
                >
                  {busy === 'assign' ? (
                    <Loader2 size={13} className="spin" />
                  ) : (
                    <Users size={13} />
                  )}
                  Save owner
                </SmallButton>
              </Actions>

              {possibleDuplicates.length > 0 ? (
                <>
                  <Subhead>Possible duplicates</Subhead>
                  <CardText>
                    These records share an email, website or company name. Review
                    them manually; nothing has been merged.
                  </CardText>
                  <Stack $gap={6}>
                    {possibleDuplicates.map((item) => (
                      <Row key={item.id}>
                        <Link
                          href={`/workspace/leads/${item.id}`}
                          style={{ fontWeight: 600, fontSize: '0.8rem' }}
                        >
                          {item.companyName}
                        </Link>
                        <Hint>
                          {item.status} · matched on {item.reasons.join(', ')}
                        </Hint>
                      </Row>
                    ))}
                  </Stack>
                </>
              ) : null}
            </Card>
          ) : null}
        </TwoCol>
      ) : null}

      {canViewOpportunities ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Opportunities</CardTitle>
              <CardText>
                One lead can hold several opportunities. Opening or closing an
                opportunity never converts the lead automatically.
              </CardText>
            </div>
            {canCreateOpportunities ? (
              <LinkButton href={`/workspace/opportunities?lead=${lead.id}`}>
                <Target size={14} />
                New opportunity
              </LinkButton>
            ) : null}
          </CardHead>

          {opportunities.length === 0 ? (
            <Hint>No opportunities have been created for this lead yet.</Hint>
          ) : (
            <Stack $gap={8}>
              {opportunities.map((item) => {
                const stage = metaFor(OPPORTUNITY_STAGE_META, item.stage);
                return (
                  <Row key={item.id}>
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`/workspace/opportunities/${item.id}`}
                        style={{ fontWeight: 600, fontSize: '0.84rem' }}
                      >
                        {item.title}
                      </Link>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {item.ownerName || item.ownerEmail || 'Unassigned'}
                        {item.nextFollowUpAt
                          ? ` · follow-up ${formatDateTime(item.nextFollowUpAt, timezone)}`
                          : ''}
                      </div>
                    </div>
                    <Row>
                      <Badge $tone={stage.tone}>{stage.label}</Badge>
                      <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                        {formatValue(item.expectedValueCents, item.currency)}
                      </span>
                    </Row>
                  </Row>
                );
              })}
            </Stack>
          )}
        </Card>
      ) : null}

      <TwoCol>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Unified timeline</CardTitle>
              <CardText>
                Read-only history across the lead, meetings, follow-ups and any
                linked client or project. Newest first.
              </CardText>
            </div>
          </CardHead>
          {timelineItems.length === 0 ? (
            <Hint>No history has been recorded for this lead yet.</Hint>
          ) : (
            <Timeline>
              {timelineItems.map((item) => (
                <TimelineItem
                  key={item.id}
                  $tone={
                    item.type === 'lost' || item.type === 'archived'
                      ? 'danger'
                      : TIMELINE_SOURCE_TONE[item.source] || 'info'
                  }
                >
                  <Badge $tone="muted">
                    {TIMELINE_SOURCE_LABELS[item.source] || item.source}
                  </Badge>
                  <strong>
                    {item.source === 'lead'
                      ? ACTIVITY_LABELS[item.type] || item.title
                      : item.title}
                  </strong>
                  {item.body ? <p>{item.body}</p> : null}
                  <span>
                    {item.href ? (
                      <Link href={item.href} style={{ marginRight: 8 }}>
                        Open
                      </Link>
                    ) : null}
                    {item.actorName || 'System'} ·{' '}
                    {formatDateTime(item.at, timezone)}
                  </span>
                </TimelineItem>
              ))}
            </Timeline>
          )}
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>Status history</CardTitle>
              <CardText>Every pipeline change, including its note.</CardText>
            </div>
          </CardHead>
          {statusHistory.length === 0 ? (
            <Hint>No status changes recorded.</Hint>
          ) : (
            <Timeline>
              {statusHistory.map((entry) => (
                <TimelineItem
                  key={entry.id}
                  $tone={entry.toStatus === 'lost' ? 'danger' : 'success'}
                >
                  <strong>
                    {entry.fromStatus
                      ? `${metaFor(LEAD_STATUS_META, entry.fromStatus).label} → ${metaFor(LEAD_STATUS_META, entry.toStatus).label}`
                      : `Created as ${metaFor(LEAD_STATUS_META, entry.toStatus).label}`}
                  </strong>
                  {entry.note ? <p>{entry.note}</p> : null}
                  <span>
                    {entry.changedByName || entry.changedByEmail || 'System'} ·{' '}
                    {formatDateTime(entry.createdAt, timezone)}
                  </span>
                </TimelineItem>
              ))}
            </Timeline>
          )}
        </Card>
      </TwoCol>
    </Page>
  );
}
