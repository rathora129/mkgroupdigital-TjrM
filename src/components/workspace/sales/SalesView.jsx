'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  PhoneCall,
  Search,
  Video,
  X,
} from 'lucide-react';
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
  LinkButton,
  Notice,
  Page,
  Row,
  Select,
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
} from '@/components/workspace/ai/primitives';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import {
  LEAD_PRIORITY_META,
  LEAD_STATUS_META,
  isOverdue,
  metaFor,
} from '@/components/workspace/phase2c/meta';
import { formatDateTime } from '@/lib/ai/format';
import { apiRequest } from '@/lib/ai/client';
import { CALL_OUTCOME_META } from '@/lib/sales/validation';

const STATUS_FILTERS = ['new', 'researching', 'qualified', 'contacted', 'follow_up'];

function defaultFollowUp() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  const pad = (part) => String(part).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

function salesHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of ['search', 'status', 'page']) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/workspace/sales?${text}` : '/workspace/sales';
}

export default function SalesView({
  data,
  meetings,
  members,
  calendar,
  query,
  canLogCalls,
  canCreateTask,
  canScheduleMeeting,
  timezone,
}) {
  const router = useRouter();
  const [selection, setSelection] = useState(null);
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  const { leads, stats, overview, followUpTasks, scope } = data;

  function choose(lead, mode) {
    setSelection({ lead, mode });
    setFailure(null);
  }

  async function submitCall(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const followUpAt = String(form.get('followUpAt') || '').trim();
    const body = {
      outcome: form.get('outcome'),
      summary: form.get('summary'),
      durationSeconds: Number(form.get('durationSeconds') || 0),
      followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
      followUpTime: form.get('followUpTime') || null,
      timezone: form.get('timezone') || timezone,
      nextAction: form.get('nextAction') || null,
      createFollowUpTask: Boolean(followUpAt),
    };

    setBusy(true);
    setFailure(null);
    try {
      const result = await apiRequest(
        `/api/workforce/leads/${selection.lead.id}/calls`,
        { method: 'POST', body },
      );
      const parts = ['Call logged.'];
      if (result.statusChange) parts.push('Lead moved to Contacted.');
      if (result.followUpTask) parts.push('Follow-up task created.');
      setNotice(parts.join(' '));
      setSelection(null);
      router.refresh();
    } catch (error) {
      setFailure(error?.message || 'The call could not be logged.');
    } finally {
      setBusy(false);
    }
  }

  async function submitFollowUp(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get('dueDate') || '').trim();
    const dueTime = String(form.get('dueTime') || '').trim();
    const dueDate = date
      ? new Date(`${date}T${dueTime || '09:00'}:00`).toISOString()
      : null;
    const body = {
      title: form.get('title'),
      description: form.get('description'),
      dueDate,
      dueTime: dueTime || null,
      timezone: form.get('timezone') || timezone,
      priority: form.get('priority') || 'medium',
      ownerUserId: form.get('ownerUserId') || null,
    };

    setBusy(true);
    setFailure(null);
    try {
      await apiRequest(`/api/workforce/leads/${selection.lead.id}/follow-up`, {
        method: 'POST',
        body,
      });
      setNotice('Follow-up task created.');
      setSelection(null);
      router.refresh();
    } catch (error) {
      setFailure(error?.message || 'The follow-up could not be created.');
    } finally {
      setBusy(false);
    }
  }

  function submitFilters(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const overrides = {
      search: String(form.get('search') || '').trim() || undefined,
      status: String(form.get('status') || '').trim() || undefined,
    };
    router.push(salesHref(query, overrides));
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Sales &amp; calls</Eyebrow>
        <Title>Caller workspace</Title>
        <Lead>
          {scope === 'assigned'
            ? 'You can only see and log calls for leads assigned to you. Duplicate or unrelated leads stay hidden.'
            : 'Every active lead in the workspace, with call logging, follow-ups and upcoming meetings.'}
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

      <StatGrid>
        <StatCard>
          <StatLabel>Calls logged today</StatLabel>
          <StatValue>{stats.callsToday}</StatValue>
          <StatNote>Recorded against actual leads</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Open follow-ups</StatLabel>
          <StatValue>{stats.followUpsDue}</StatValue>
          <StatNote>
            {followUpTasks.filter((task) => task.isOverdue).length} overdue
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Meetings this week</StatLabel>
          <StatValue>{stats.meetingsThisWeek}</StatValue>
          <StatNote>Held in this workspace</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Active leads</StatLabel>
          <StatValue>{overview.total}</StatValue>
          <StatNote>{overview.assignedToMe} assigned to you</StatNote>
        </StatCard>
      </StatGrid>

      <Notice $tone="info">
        <Video size={15} />
        <span>
          <strong>Google Calendar:</strong> {calendar.message}{' '}
          <Link href="/workspace/meetings" style={{ fontWeight: 600 }}>
            Open meetings
          </Link>
        </span>
      </Notice>

      <Grid>
        <Stack>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Call list</CardTitle>
                <CardText>
                  {leads.total} {leads.total === 1 ? 'lead' : 'leads'} in scope.
                  Showing page {leads.page} of {leads.pages}.
                </CardText>
              </div>
            </CardHead>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <FilterChip href={salesHref(query, { status: undefined })} $active={!query.status}>
                All stages
              </FilterChip>
              {STATUS_FILTERS.map((status) => (
                <FilterChip
                  key={status}
                  href={salesHref(query, { status })}
                  $active={query.status === status}
                >
                  {metaFor(LEAD_STATUS_META, status).label}
                </FilterChip>
              ))}
            </div>

            <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
              <FilterField>
                <span>Search</span>
                <input
                  type="search"
                  name="search"
                  defaultValue={query.search || ''}
                  placeholder="Company, contact, phone"
                />
              </FilterField>
              <FilterField>
                <span>Stage</span>
                <select name="status" defaultValue={query.status || ''}>
                  <option value="">Any stage</option>
                  {Object.keys(LEAD_STATUS_META).map((status) => (
                    <option key={status} value={status}>
                      {metaFor(LEAD_STATUS_META, status).label}
                    </option>
                  ))}
                </select>
              </FilterField>
              <Actions>
                <Button type="submit">
                  <Search size={14} />
                  Apply
                </Button>
              </Actions>
            </FilterBar>

            {leads.items.length === 0 ? (
              <EmptyState>
                <PhoneCall size={17} aria-hidden="true" />
                <div>
                  <h3>No leads are assigned to you yet</h3>
                  <p>
                    A manager can assign leads from the Leads pipeline. You only
                    see leads assigned to you.
                  </p>
                </div>
              </EmptyState>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Stage</th>
                      <th>Phone</th>
                      <th>Next follow-up</th>
                      <th>AI signal</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.items.map((lead) => {
                      const status = metaFor(LEAD_STATUS_META, lead.status);
                      const priority = metaFor(LEAD_PRIORITY_META, lead.priority);
                      return (
                        <tr key={lead.id}>
                          <td>
                            <Link href={`/workspace/leads/${lead.id}`}>
                              {lead.companyName}
                            </Link>
                            {lead.contactName ? (
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                {lead.contactName}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <Badge $tone={status.tone}>{status.label}</Badge>
                          </td>
                          <td>{lead.phone || '—'}</td>
                          <td>
                            {lead.nextFollowUpAt
                              ? formatDateTime(lead.nextFollowUpAt, timezone)
                              : '—'}
                            {isOverdue(lead.nextFollowUpAt) ? (
                              <>
                                {' '}
                                <Badge $tone="danger">Overdue</Badge>
                              </>
                            ) : null}
                          </td>
                          <td>
                            {lead.aiLeadScore == null ? (
                              priority.label
                            ) : (
                              <>
                                <Badge $tone={priority.tone}>{lead.aiLeadScore}</Badge>{' '}
                                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                  {lead.aiTemperature || 'unknown'}
                                </span>
                              </>
                            )}
                          </td>
                          <td>
                            <Row>
                              {canLogCalls ? (
                                <Button type="button" onClick={() => choose(lead, 'call')}>
                                  <PhoneCall size={14} />
                                  Log call
                                </Button>
                              ) : null}
                              {canCreateTask ? (
                                <Button
                                  type="button"
                                  $variant="ghost"
                                  onClick={() => choose(lead, 'follow_up')}
                                >
                                  <CalendarClock size={14} />
                                  Follow-up
                                </Button>
                              ) : null}
                            </Row>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}

            <ListPager
              page={leads.page}
              pages={leads.pages}
              total={leads.total}
              pageSize={leads.pageSize}
              hrefFor={(target) => salesHref(query, { page: target })}
            />
          </Card>

          {selection ? (
            <Card>
              <CardHead>
                <div>
                  <CardTitle>
                    {selection.mode === 'call' ? 'Log a call' : 'Schedule a follow-up'} ·{' '}
                    {selection.lead.companyName}
                  </CardTitle>
                  <CardText>
                    {selection.mode === 'call'
                      ? 'The call is recorded in the lead timeline with its outcome. Nothing is sent to the prospect automatically.'
                      : 'A follow-up task appears in Tasks and triggers a reminder for its owner.'}
                  </CardText>
                </div>
                <Actions>
                  <Button
                    type="button"
                    $variant="ghost"
                    onClick={() => setSelection(null)}
                  >
                    <X size={15} />
                    Close
                  </Button>
                </Actions>
              </CardHead>

              {selection.mode === 'call' ? (
                <form onSubmit={submitCall}>
                  <Grid>
                    <Field>
                      <Label htmlFor="call-outcome">Outcome</Label>
                      <Select id="call-outcome" name="outcome" required defaultValue="connected">
                        {Object.entries(CALL_OUTCOME_META).map(([value, meta]) => (
                          <option key={value} value={value}>
                            {meta.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="call-duration">Duration (seconds)</Label>
                      <Input
                        id="call-duration"
                        name="durationSeconds"
                        type="number"
                        min="0"
                        max="86400"
                        defaultValue="0"
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="call-followup">Next follow-up</Label>
                      <Input
                        id="call-followup"
                        name="followUpAt"
                        type="datetime-local"
                        defaultValue={defaultFollowUp()}
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="call-next">Next action</Label>
                      <Input
                        id="call-next"
                        name="nextAction"
                        maxLength={300}
                        placeholder="Send the SEO proposal"
                      />
                    </Field>
                  </Grid>
                  <Field>
                    <Label htmlFor="call-summary">Notes</Label>
                    <Textarea
                      id="call-summary"
                      name="summary"
                      rows={3}
                      maxLength={2000}
                      placeholder="What was discussed? Keep it factual."
                    />
                  </Field>
                  <input type="hidden" name="timezone" value={timezone} />
                  <CheckLine>
                    <span>
                      A follow-up task is created for the lead owner when a
                      follow-up time is set.
                    </span>
                  </CheckLine>
                  <Actions>
                    <Button type="submit" $variant="primary" disabled={busy}>
                      {busy ? 'Saving…' : 'Save call'}
                    </Button>
                  </Actions>
                </form>
              ) : (
                <form onSubmit={submitFollowUp}>
                  <Grid>
                    <Field>
                      <Label htmlFor="fu-title">Title</Label>
                      <Input
                        id="fu-title"
                        name="title"
                        maxLength={200}
                        placeholder={`Follow up with ${selection.lead.companyName}`}
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="fu-date">Due date</Label>
                      <Input id="fu-date" name="dueDate" type="date" required />
                    </Field>
                    <Field>
                      <Label htmlFor="fu-time">Due time</Label>
                      <Input id="fu-time" name="dueTime" type="time" />
                    </Field>
                    <Field>
                      <Label htmlFor="fu-priority">Priority</Label>
                      <Select id="fu-priority" name="priority" defaultValue="medium">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="fu-owner">Owner</Label>
                      <Select
                        id="fu-owner"
                        name="ownerUserId"
                        defaultValue={selection.lead.assignedUserId || ''}
                      >
                        <option value="">Lead owner or you</option>
                        {members.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name || member.email}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </Grid>
                  <Field>
                    <Label htmlFor="fu-description">Notes</Label>
                    <Textarea
                      id="fu-description"
                      name="description"
                      rows={2}
                      maxLength={2000}
                    />
                  </Field>
                  <input type="hidden" name="timezone" value={timezone} />
                  <Actions>
                    <Button type="submit" $variant="primary" disabled={busy}>
                      {busy ? 'Saving…' : 'Create follow-up'}
                    </Button>
                  </Actions>
                </form>
              )}
            </Card>
          ) : null}
        </Stack>

        <Stack>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Open follow-ups</CardTitle>
                <CardText>Ordered by the nearest due date.</CardText>
              </div>
            </CardHead>
            {followUpTasks.length === 0 ? (
              <Hint>No open follow-up tasks. Log a call to create one.</Hint>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followUpTasks.slice(0, 10).map((task) => (
                      <tr key={task.id}>
                        <td>
                          {task.leadId ? (
                            <Link href={`/workspace/leads/${task.leadId}`}>
                              {task.leadCompanyName || task.title}
                            </Link>
                          ) : (
                            task.title
                          )}
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {task.ownerName || 'Unassigned'}
                          </div>
                        </td>
                        <td>
                          {formatDateTime(task.dueDate, task.timezone || timezone)}
                          {task.isOverdue ? (
                            <>
                              {' '}
                              <Badge $tone="danger">Overdue</Badge>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
            <Actions>
              <LinkButton href="/workspace/tasks">All tasks</LinkButton>
            </Actions>
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Upcoming meetings</CardTitle>
                <CardText>Stored in this workspace.</CardText>
              </div>
            </CardHead>
            {meetings.length === 0 ? (
              <Hint>No upcoming meetings scheduled.</Hint>
            ) : (
              <Stack>
                {meetings.map((meeting) => (
                  <Row key={meeting.id} style={{ justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{meeting.title}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {meeting.leadCompanyName || meeting.clientName || 'Internal'} ·{' '}
                        {formatDateTime(meeting.startsAt, meeting.timezone || timezone)}
                      </div>
                    </div>
                    <Badge $tone={meeting.status === 'scheduled' ? 'info' : 'warning'}>
                      {meeting.status}
                    </Badge>
                  </Row>
                ))}
              </Stack>
            )}
            <Actions>
              <LinkButton href="/workspace/meetings">
                <CheckCircle2 size={15} />
                {canScheduleMeeting ? 'Schedule meeting' : 'View meetings'}
              </LinkButton>
            </Actions>
          </Card>
        </Stack>
      </Grid>
    </Page>
  );
}

function CheckLine({ children }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
        fontSize: '0.78rem',
        color: '#64748B',
      }}
    >
      <CheckCircle2 size={14} />
      {children}
    </div>
  );
}
