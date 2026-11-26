'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CircleAlert,
  FileText,
  FolderKanban,
  Loader2,
  Pencil,
  Users,
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
import { MetaGrid, Subhead, Timeline, TimelineItem } from '@/components/workspace/phase2c/ui';
import { formatMoney } from '@/components/workspace/proposals/meta';
import { PROJECT_STATUS_LABELS } from '@/lib/projects/transitions';
import {
  metaFor,
  PRIORITY_META,
  PROJECT_ACTIVITY_LABELS,
  PROJECT_STATUS_META,
} from './meta';
import ProjectSettingsForm from './ProjectSettingsForm';
import ProjectTaskSection from './ProjectTaskSection';
import ProjectTrackableSection from './ProjectTrackableSection';
import ProjectScopeSection from './ProjectScopeSection';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'deliverables', label: 'Deliverables' },
  { key: 'scope', label: 'Scope changes' },
  { key: 'activity', label: 'Activity' },
];

export default function ProjectDetailView({
  detail,
  members,
  timezone,
  permissions,
  canRunAi,
  initialTab = 'overview',
  initialTaskId = null,
}) {
  const router = useRouter();
  const { project, commercialSnapshot, members: team, statusHistory, tasks, milestones, deliverables, scopeChanges, activity, taskSummary } = detail;
  const [tab, setTab] = useState(
    TABS.some((entry) => entry.key === initialTab) ? initialTab : 'overview',
  );
  const [editing, setEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState(project.status);
  const [statusNote, setStatusNote] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [showAi, setShowAi] = useState(false);

  const statusMeta = metaFor(PROJECT_STATUS_META, project.status);
  const priorityMeta = metaFor(PRIORITY_META, project.priority);
  const allowed = detail.permissionsHints.canChangeStatusTo;

  function refresh() {
    router.refresh();
  }

  async function changeStatus() {
    if (statusDraft === project.status) return;
    setSavingStatus(true);
    setFailure(null);
    try {
      await apiRequest(`/api/workforce/projects/${project.id}/status`, {
        method: 'POST',
        body: { status: statusDraft, note: statusNote.trim() || null },
      });
      setNotice(`Project moved to ${PROJECT_STATUS_LABELS[statusDraft]}.`);
      setStatusNote('');
      refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setSavingStatus(false);
    }
  }

  async function requestAi() {
    setAiBusy(true);
    setFailure(null);
    try {
      const result = await apiRequest(
        `/api/workforce/projects/${project.id}/ai-draft`,
        {
          method: 'POST',
          body: { instruction: aiInstruction.trim() || null },
        },
      );
      setNotice(
        `AI draft queued with ${result.agent?.name || 'an assistant'}. Review the run before using its output.`,
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
          <Link href="/workspace/projects">Projects</Link> · {project.reference}
        </Eyebrow>
        <Title>{project.name}</Title>
        <Lead>
          {project.companyName ? `${project.companyName} · ` : ''}
          Delivering the accepted proposal version {project.proposalVersionNumber || '—'}
          {project.proposalReference ? ` (${project.proposalReference})` : ''}.
        </Lead>
      </Header>

      <Stack $gap={10}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Badge $tone={statusMeta.tone}>{statusMeta.label}</Badge>
          <Badge $tone={priorityMeta.tone}>{priorityMeta.label} priority</Badge>
          {project.opportunityId ? (
            <Link href={`/workspace/opportunities/${project.opportunityId}`}>
              <Badge $tone="info">Opportunity</Badge>
            </Link>
          ) : null}
          {project.proposalId ? (
            <Link href={`/workspace/proposals/${project.proposalId}`}>
              <Badge $tone="success">Proposal {project.proposalReference}</Badge>
            </Link>
          ) : null}
          {project.clientId ? (
            <Link href={`/workspace/clients/${project.clientId}`}>
              <Badge $tone="info">Client</Badge>
            </Link>
          ) : null}
          {project.clientId ? (
            <Link href={`/workspace/finance/invoices?clientId=${project.clientId}`}>
              <Badge $tone="muted">Finance</Badge>
            </Link>
          ) : null}
        </div>

        {failure ? <Notice $tone="danger">{failure}</Notice> : null}
        {notice ? <Notice $tone="success">{notice}</Notice> : null}
      </Stack>

      <StatGrid>
        <StatCard>
          <StatLabel>Accepted scope value</StatLabel>
          <StatValue>{formatMoney(project.acceptedValueCents, project.currency)}</StatValue>
          <StatNote>Approved commercial amount, not invoiced revenue</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Recurring monthly</StatLabel>
          <StatValue>
            {formatMoney(project.recurringMonthlyCents, project.currency)}
          </StatValue>
          <StatNote>
            Quarterly {formatMoney(project.recurringQuarterlyCents, project.currency)} · annual{' '}
            {formatMoney(project.recurringAnnualCents, project.currency)}
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Open tasks</StatLabel>
          <StatValue>{taskSummary.open}</StatValue>
          <StatNote>
            {taskSummary.completed} completed · {taskSummary.total} total
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Overdue / due today</StatLabel>
          <StatValue>{taskSummary.overdue}</StatValue>
          <StatNote>{taskSummary.dueToday} due today</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Project controls</CardTitle>
            <CardText>
              Status changes are recorded with a history entry and never happen
              automatically.
            </CardText>
          </div>
          <Actions>
            {permissions.canEdit ? (
              <Button type="button" onClick={() => setEditing((current) => !current)}>
                <Pencil size={14} />
                {editing ? 'Close editor' : 'Edit details'}
              </Button>
            ) : null}
            {canRunAi ? (
              <Button
                type="button"
                onClick={() => setShowAi((current) => !current)}
              >
                <Bot size={14} />
                {showAi ? 'Close AI draft' : 'AI draft'}
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {allowed.length > 0 && permissions.canEdit ? (
          <Field>
            <Label htmlFor="project-status">Move project status</Label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Select
                id="project-status"
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value)}
                disabled={savingStatus}
                style={{ maxWidth: 220 }}
              >
                <option value={project.status}>
                  {PROJECT_STATUS_LABELS[project.status]} (current)
                </option>
                {allowed.map((status) => (
                  <option key={status} value={status}>
                    {PROJECT_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                onClick={changeStatus}
                disabled={savingStatus || statusDraft === project.status}
              >
                {savingStatus ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <ArrowRight size={14} />
                )}
                Update status
              </Button>
            </div>
            {statusDraft !== project.status ? (
              <Textarea
                value={statusNote}
                onChange={(event) => setStatusNote(event.target.value)}
                maxLength={1_000}
                style={{ minHeight: 56, marginTop: 8 }}
                placeholder="Optional note for the status history."
                disabled={savingStatus}
              />
            ) : null}
          </Field>
        ) : (
          <CardText>
            {allowed.length === 0
              ? 'This project is in a terminal state and cannot change status.'
              : 'You can view this project but not change its status.'}
          </CardText>
        )}

        {showAi && canRunAi ? (
          <Stack $gap={8} style={{ marginTop: 12 }}>
            <Field>
              <Label htmlFor="project-ai-instruction">Drafting instruction</Label>
              <Textarea
                id="project-ai-instruction"
                value={aiInstruction}
                onChange={(event) => setAiInstruction(event.target.value)}
                maxLength={1_000}
                style={{ minHeight: 60 }}
                placeholder="Ask for a progress summary, risk note or task suggestions."
                disabled={aiBusy}
              />
            </Field>
            <Hint>
              The assistant may suggest and draft. It cannot change status,
              approve work, edit accepted scope or mark tasks complete.
            </Hint>
            <Actions>
              <Button type="button" onClick={requestAi} disabled={aiBusy}>
                {aiBusy ? <Loader2 size={14} className="spin" /> : <Bot size={14} />}
                Queue AI draft
              </Button>
            </Actions>
          </Stack>
        ) : null}

        {editing && permissions.canEdit ? (
          <Stack $gap={10} style={{ marginTop: 12 }}>
            <Subhead>Edit project details</Subhead>
            <ProjectSettingsForm
              project={project}
              members={members}
              onDone={() => {
                setEditing(false);
                setNotice('Project details saved.');
                refresh();
              }}
              onCancel={() => setEditing(false)}
            />
          </Stack>
        ) : null}
      </Card>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TABS.map((entry) => (
            <Button
              key={entry.key}
              type="button"
              $variant={tab === entry.key ? 'primary' : 'ghost'}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      </Card>

      {tab === 'overview' ? (
        <>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Delivery details</CardTitle>
                <CardText>
                  Dates, ownership and identifiers for this project.
                </CardText>
              </div>
              <FolderKanban size={16} aria-hidden="true" />
            </CardHead>
            <MetaGrid>
              <div>
                <dt>Reference</dt>
                <dd>{project.reference}</dd>
              </div>
              <div>
                <dt>Client</dt>
                <dd>{project.companyName || '—'}</dd>
              </div>
              <div>
                <dt>Delivery owner</dt>
                <dd>{project.ownerName || project.ownerEmail || 'Unassigned'}</dd>
              </div>
              <div>
                <dt>Start</dt>
                <dd>{formatDate(project.startDate, timezone)}</dd>
              </div>
              <div>
                <dt>Expected completion</dt>
                <dd>{formatDate(project.expectedCompletionDate, timezone)}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{formatDate(project.actualCompletionDate, timezone)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(project.createdAt, timezone)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDateTime(project.updatedAt, timezone)}</dd>
              </div>
            </MetaGrid>
            {project.description ? (
              <Stack $gap={6}>
                <Subhead>Description</Subhead>
                <CardText>{project.description}</CardText>
              </Stack>
            ) : null}
            {permissions.canEdit && project.internalNotes ? (
              <Stack $gap={6}>
                <Subhead>Internal notes</Subhead>
                <CardText>{project.internalNotes}</CardText>
              </Stack>
            ) : null}
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Accepted commercial snapshot</CardTitle>
                <CardText>
                  Captured from proposal version{' '}
                  {commercialSnapshot?.versionNumber || project.proposalVersionNumber || '—'}{' '}
                  at project creation. Later proposal edits never change this
                  record.
                </CardText>
              </div>
              <FileText size={16} aria-hidden="true" />
            </CardHead>
            {commercialSnapshot?.source === 'lead_conversion' ? (
              <Notice $tone="warning">
                <span>
                  This project was created by converting a won lead. The figures
                  below were reported by the owner; they are not verified
                  payments and no accepted proposal total exists.
                </span>
                {commercialSnapshot.reportedAmounts ? (
                  <MetaGrid>
                    <div>
                      <dt>Reported received</dt>
                      <dd>
                        {commercialSnapshot.reportedAmounts.receivedCents == null
                          ? '—'
                          : formatMoney(
                              commercialSnapshot.reportedAmounts.receivedCents,
                              project.currency,
                            )}
                      </dd>
                    </div>
                    <div>
                      <dt>Reported outstanding</dt>
                      <dd>
                        {commercialSnapshot.reportedAmounts.outstandingCents == null
                          ? '—'
                          : formatMoney(
                              commercialSnapshot.reportedAmounts.outstandingCents,
                              project.currency,
                            )}
                      </dd>
                    </div>
                    <div>
                      <dt>Reported project cost</dt>
                      <dd>
                        {commercialSnapshot.reportedAmounts.projectCostCents == null
                          ? '—'
                          : formatMoney(
                              commercialSnapshot.reportedAmounts.projectCostCents,
                              project.currency,
                            )}
                      </dd>
                    </div>
                  </MetaGrid>
                ) : null}
                {project.leadId ? (
                  <Link href={`/workspace/leads/${project.leadId}`}>
                    Open the original lead
                  </Link>
                ) : null}
              </Notice>
            ) : null}
            {commercialSnapshot?.lines?.length ? (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Quantity</th>
                      <th>Billing</th>
                      <th>Unit price</th>
                      <th>Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercialSnapshot.lines.map((line, index) => (
                      <tr key={`${line.name}-${index}`}>
                        <td>
                          {line.name}
                          {line.kind === 'optional' ? ' (optional)' : ''}
                          {line.regulated ? ' · regulated' : ''}
                        </td>
                        <td>
                          {line.quantity} {line.unit}
                        </td>
                        <td>{line.billingType}</td>
                        <td>{formatMoney(line.unitPriceCents, commercialSnapshot.currency)}</td>
                        <td>{formatMoney(line.lineTotalCents, commercialSnapshot.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            ) : (
              <CardText>No line items were captured with this acceptance.</CardText>
            )}
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Delivery team</CardTitle>
                <CardText>{team.length} people assigned to this project.</CardText>
              </div>
              <Users size={16} aria-hidden="true" />
            </CardHead>
            {team.length === 0 ? (
              <CardText>No team members assigned.</CardText>
            ) : (
              <MetaGrid>
                {team.map((member) => (
                  <div key={member.userId}>
                    <dt>{member.role === 'lead' ? 'Lead' : 'Member'}</dt>
                    <dd>{member.name || member.email}</dd>
                  </div>
                ))}
              </MetaGrid>
            )}
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Status history</CardTitle>
                <CardText>Every controlled status transition is retained.</CardText>
              </div>
              <CalendarClock size={16} aria-hidden="true" />
            </CardHead>
            {statusHistory.length === 0 ? (
              <CardText>No status changes recorded.</CardText>
            ) : (
              <Timeline>
                {statusHistory.map((entry) => (
                  <TimelineItem key={entry.id}>
                    <strong>
                      {entry.fromStatus
                        ? `${PROJECT_STATUS_LABELS[entry.fromStatus]} → ${
                            PROJECT_STATUS_LABELS[entry.toStatus]
                          }`
                        : PROJECT_STATUS_LABELS[entry.toStatus]}
                    </strong>
                    {entry.note ? <p>{entry.note}</p> : null}
                    <span>
                      {formatDateTime(entry.createdAt, timezone)}
                      {entry.actorName ? ` · ${entry.actorName}` : ''}
                    </span>
                  </TimelineItem>
                ))}
              </Timeline>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'tasks' ? (
        <ProjectTaskSection
          projectId={project.id}
          projectStatus={project.status}
          tasks={tasks}
          members={members}
          canEdit={permissions.canEdit}
          timezone={timezone}
          onChanged={refresh}
          initialTaskId={initialTaskId}
        />
      ) : null}

      {tab === 'milestones' ? (
        <ProjectTrackableSection
          kind="milestone"
          projectId={project.id}
          items={milestones}
          members={members}
          canEdit={permissions.canEdit}
          timezone={timezone}
          closed={project.status === 'completed' || project.status === 'cancelled'}
          onChanged={refresh}
        />
      ) : null}

      {tab === 'deliverables' ? (
        <ProjectTrackableSection
          kind="deliverable"
          projectId={project.id}
          items={deliverables}
          members={members}
          canEdit={permissions.canEdit}
          timezone={timezone}
          closed={project.status === 'completed' || project.status === 'cancelled'}
          onChanged={refresh}
        />
      ) : null}

      {tab === 'scope' ? (
        <ProjectScopeSection
          projectId={project.id}
          scopeChanges={scopeChanges}
          canEdit={permissions.canEdit}
          canManage={permissions.canManage}
          timezone={timezone}
          onChanged={refresh}
        />
      ) : null}

      {tab === 'activity' ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Project activity</CardTitle>
              <CardText>Latest 100 recorded events, newest first.</CardText>
            </div>
          </CardHead>
          {activity.length === 0 ? (
            <CardText>No activity recorded yet.</CardText>
          ) : (
            <Timeline>
              {activity.map((entry) => (
                <TimelineItem key={entry.id}>
                  <strong>
                    {PROJECT_ACTIVITY_LABELS[entry.type] || entry.type}
                  </strong>
                  {entry.body ? <p>{entry.body}</p> : null}
                  <span>
                    {formatDateTime(entry.createdAt, timezone)}
                    {entry.actorName ? ` · ${entry.actorName}` : ''}
                  </span>
                </TimelineItem>
              ))}
            </Timeline>
          )}
        </Card>
      ) : null}

      <Hint>
        <CircleAlert size={12} aria-hidden="true" /> Accepted scope, deliverables
        and milestones are a delivery record. Invoices, payments and revenue are
        handled in the finance module only.
      </Hint>
    </Page>
  );
}
