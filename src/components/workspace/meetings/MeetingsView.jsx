'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  CalendarPlus,
  CheckCircle2,
  CircleAlert,
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
  Select,
  Stack,
  Table,
  TableWrap,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import { FilterChip, ListPager, MetaGrid } from '@/components/workspace/phase2c/ui';
import { formatDateTime } from '@/lib/ai/format';
import { apiRequest } from '@/lib/ai/client';
import { MEETING_STATUSES } from '@/lib/sales/validation';

const MEETING_STATUS_META = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  rescheduled: { label: 'Rescheduled', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

function metaFor(status) {
  return MEETING_STATUS_META[status] || { label: status, tone: 'muted' };
}

function meetingsHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  if (merged.status) search.set('status', merged.status);
  if (merged.upcoming) search.set('upcoming', 'true');
  if (Number(merged.page) > 1) search.set('page', String(merged.page));
  const text = search.toString();
  return text ? `/workspace/meetings?${text}` : '/workspace/meetings';
}

function defaultRange() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const pad = (part) => String(part).padStart(2, '0');
  const local = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return { start: local(start), end: local(end) };
}

export default function MeetingsView({
  meetings,
  leadOptions,
  calendar,
  query,
  canSchedule,
  canManage,
  timezone,
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const range = defaultRange();

  async function schedule(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const attendees = String(form.get('attendees') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const body = {
      title: form.get('title'),
      leadId: form.get('leadId') || null,
      startsAt: new Date(form.get('startsAt')).toISOString(),
      endsAt: new Date(form.get('endsAt')).toISOString(),
      timezone: form.get('timezone') || timezone,
      location: form.get('location'),
      agenda: form.get('agenda'),
      attendees,
      syncCalendar: form.get('syncCalendar') === 'on',
    };

    setBusy(true);
    setFailure(null);
    try {
      const result = await apiRequest('/api/workforce/meetings', {
        method: 'POST',
        body,
      });
      const sync = result.calendarSync;
      setNotice(
        sync?.synced
          ? 'Meeting created and synced to Google Calendar.'
          : `Meeting saved in this workspace. ${sync?.message || ''}`,
      );
      setShowForm(false);
      router.refresh();
    } catch (error) {
      setFailure(error?.message || 'The meeting could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(meeting, status) {
    if (status === 'cancelled' && !window.confirm('Cancel this meeting?')) return;
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      await apiRequest(`/api/workforce/meetings/${meeting.id}`, {
        method: 'PATCH',
        body: { status },
      });
      setNotice(`Meeting marked ${status}.`);
      router.refresh();
    } catch (error) {
      setFailure(error?.message || 'The meeting could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Meetings</Eyebrow>
        <Title>Client and lead meetings</Title>
        <Lead>
          Meetings are stored in this workspace. Google Calendar and Meet are
          only used after a real OAuth connection exists; this build never
          fabricates a calendar event or a Meet link.
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

      <Notice $tone={calendar.connected ? 'success' : 'warning'}>
        <Video size={15} />
        <span>
          <strong>Google Calendar:</strong> {calendar.message}
        </span>
      </Notice>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Meetings</CardTitle>
            <CardText>
              {meetings.total} {meetings.total === 1 ? 'meeting' : 'meetings'}.
              Showing page {meetings.page} of {meetings.pages}.
            </CardText>
          </div>
          <Actions>
            {canSchedule ? (
              <Button
                type="button"
                $variant="primary"
                onClick={() => setShowForm((value) => !value)}
              >
                {showForm ? <X size={15} /> : <CalendarPlus size={15} />}
                {showForm ? 'Close form' : 'Schedule meeting'}
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip href={meetingsHref(query, { status: undefined })} $active={!query.status}>
            All
          </FilterChip>
          {MEETING_STATUSES.map((status) => (
            <FilterChip
              key={status}
              href={meetingsHref(query, { status })}
              $active={query.status === status}
            >
              {metaFor(status).label}
            </FilterChip>
          ))}
          <FilterChip
            href={meetingsHref(query, { upcoming: query.upcoming ? undefined : true })}
            $active={Boolean(query.upcoming)}
          >
            Upcoming only
          </FilterChip>
        </div>

        {showForm && canSchedule ? (
          <form onSubmit={schedule} style={{ marginTop: 12 }}>
            <Grid>
              <Field>
                <Label htmlFor="meeting-title">Title</Label>
                <Input id="meeting-title" name="title" required maxLength={200} />
              </Field>
              <Field>
                <Label htmlFor="meeting-lead">Lead</Label>
                <Select id="meeting-lead" name="leadId" defaultValue="">
                  <option value="">No lead (internal)</option>
                  {leadOptions.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.companyName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="meeting-start">Starts</Label>
                <Input
                  id="meeting-start"
                  name="startsAt"
                  type="datetime-local"
                  required
                  defaultValue={range.start}
                />
              </Field>
              <Field>
                <Label htmlFor="meeting-end">Ends</Label>
                <Input
                  id="meeting-end"
                  name="endsAt"
                  type="datetime-local"
                  required
                  defaultValue={range.end}
                />
              </Field>
              <Field>
                <Label htmlFor="meeting-location">Location or link</Label>
                <Input id="meeting-location" name="location" maxLength={300} />
              </Field>
              <Field>
                <Label htmlFor="meeting-timezone">Timezone</Label>
                <Input
                  id="meeting-timezone"
                  name="timezone"
                  defaultValue={timezone}
                  maxLength={80}
                />
              </Field>
            </Grid>
            <Field>
              <Label htmlFor="meeting-attendees">Attendees</Label>
              <Input
                id="meeting-attendees"
                name="attendees"
                placeholder="name@company.com, second@company.com"
              />
            </Field>
            <Field>
              <Label htmlFor="meeting-agenda">Agenda</Label>
              <Textarea id="meeting-agenda" name="agenda" rows={3} maxLength={4000} />
            </Field>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.8rem',
                color: '#475569',
              }}
            >
              <input type="checkbox" name="syncCalendar" disabled={!calendar.connected} />
              Sync to Google Calendar
              {calendar.connected ? null : (
                <span style={{ color: '#B45309' }}>
                  · unavailable until OAuth is connected
                </span>
              )}
            </label>
            <Actions>
              <Button type="submit" $variant="primary" disabled={busy}>
                {busy ? 'Saving…' : 'Schedule'}
              </Button>
            </Actions>
          </form>
        ) : null}

        {meetings.items.length === 0 ? (
          <EmptyState>
            <CalendarPlus size={17} aria-hidden="true" />
            <div>
              <h3>No meetings match these filters</h3>
              <p>Schedule a meeting for a lead or client, or clear the filters.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Meeting</th>
                  <th>Related to</th>
                  <th>Starts</th>
                  <th>Status</th>
                  <th>Calendar</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {meetings.items.map((meeting) => {
                  const status = metaFor(meeting.status);
                  return (
                    <tr key={meeting.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setSelected(meeting)}
                          style={{
                            border: 'none',
                            background: 'none',
                            padding: 0,
                            font: 'inherit',
                            fontWeight: 600,
                            color: 'inherit',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          {meeting.title}
                        </button>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {meeting.createdByName || 'Workspace member'}
                        </div>
                      </td>
                      <td>
                        {meeting.leadId ? (
                          <Link href={`/workspace/leads/${meeting.leadId}`}>
                            {meeting.leadCompanyName}
                          </Link>
                        ) : (
                          meeting.clientName || meeting.projectName || 'Internal'
                        )}
                      </td>
                      <td>{formatDateTime(meeting.startsAt, meeting.timezone || timezone)}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        {meeting.meetLink ? (
                          <a href={meeting.meetLink} target="_blank" rel="noreferrer">
                            Meet link
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            Local only
                          </span>
                        )}
                      </td>
                      <td>
                        {canManage ? (
                          <Actions>
                            {['scheduled', 'rescheduled'].includes(meeting.status) ? (
                              <>
                                <Button
                                  type="button"
                                  $variant="ghost"
                                  disabled={busy}
                                  onClick={() => changeStatus(meeting, 'completed')}
                                >
                                  <CheckCircle2 size={14} />
                                  Done
                                </Button>
                                <Button
                                  type="button"
                                  $variant="ghost"
                                  disabled={busy}
                                  onClick={() => changeStatus(meeting, 'cancelled')}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                {status.label}
                              </span>
                            )}
                          </Actions>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}

        <ListPager
          page={meetings.page}
          pages={meetings.pages}
          total={meetings.total}
          pageSize={meetings.pageSize}
          hrefFor={(target) => meetingsHref(query, { page: target })}
        />
      </Card>

      {selected ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>{selected.title}</CardTitle>
              <CardText>
                {formatDateTime(selected.startsAt, selected.timezone || timezone)} –{' '}
                {formatDateTime(selected.endsAt, selected.timezone || timezone)}
              </CardText>
            </div>
            <Actions>
              <Button type="button" $variant="ghost" onClick={() => setSelected(null)}>
                <X size={15} />
                Close
              </Button>
            </Actions>
          </CardHead>
          <MetaGrid>
            <div>
              <dt>Lead</dt>
              <dd>
                {selected.leadId ? (
                  <Link href={`/workspace/leads/${selected.leadId}`}>
                    {selected.leadCompanyName}
                  </Link>
                ) : (
                  'None'
                )}
              </dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{selected.location || 'Not set'}</dd>
            </div>
            <div>
              <dt>Attendees</dt>
              <dd>
                {Array.isArray(selected.attendees) && selected.attendees.length
                  ? selected.attendees.join(', ')
                  : 'None listed'}
              </dd>
            </div>
            <div>
              <dt>Meet link</dt>
              <dd>{selected.meetLink || 'Not created (Google Calendar not connected)'}</dd>
            </div>
          </MetaGrid>
          {selected.agenda ? (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: '0.8rem' }}>Agenda</strong>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
                {selected.agenda}
              </p>
            </div>
          ) : null}
          {selected.notes ? (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: '0.8rem' }}>Notes</strong>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
                {selected.notes}
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Hint>
        Meetings are workspace records. Calendar invites and Google Meet links
        are only created after a real OAuth connection, so the workspace never
        shows a meeting as synced when it is not.
      </Hint>
      <Stack>
        <LinkButton href="/workspace/sales">Back to caller workspace</LinkButton>
      </Stack>
    </Page>
  );
}
