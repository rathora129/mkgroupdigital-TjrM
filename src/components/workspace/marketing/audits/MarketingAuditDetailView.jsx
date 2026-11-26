'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormik } from 'formik';
import { useRouter } from 'next/navigation';
import { CircleAlert, ListChecks, Loader2, Plus } from 'lucide-react';
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
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import { MetaGrid } from '@/components/workspace/phase2c/ui';
import { AUDIT_STATUS_META, metaFor } from '@/components/workspace/phase2c/meta';
import { apiRequest } from '@/lib/ai/client';
import { formatDateTime } from '@/lib/ai/format';
import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
} from '@/lib/audits/validation';
import {
  FINDING_SOURCES,
  FINDING_SOURCE_LABELS,
  FINDING_STATUSES,
  FINDING_STATUS_LABELS,
} from '@/lib/marketing/constants';
import MarketingNav from '../MarketingNav';
import {
  FINDING_SOURCE_META,
  FINDING_STATUS_META,
  SEVERITY_META,
  dateInputValue,
  toIsoDate,
} from '../meta';

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const FINDING_STATUS_ORDER = FINDING_STATUSES;
const PRIORITIES = [
  { key: '', label: 'Default from severity' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
  { key: 'urgent', label: 'Urgent' },
];

function FindingForm({ auditId, members, onDone }) {
  const [failure, setFailure] = useState(null);

  const formik = useFormik({
    initialValues: {
      category: AUDIT_CATEGORIES[0],
      severity: 'medium',
      code: '',
      title: '',
      description: '',
      evidence: '',
      recommendation: '',
      sourcePage: '',
      sourceType: 'manual',
      assignedToUserId: '',
    },
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        await apiRequest(
          `/api/workforce/website-audits/${auditId}/findings`,
          {
            method: 'POST',
            body: {
              category: values.category,
              severity: values.severity,
              code: values.code,
              title: values.title,
              description: values.description,
              evidence: values.evidence || null,
              recommendation: values.recommendation,
              sourcePage: values.sourcePage || null,
              sourceType: values.sourceType,
              assignedToUserId: values.assignedToUserId || null,
            },
          },
        );
        helpers.resetForm();
        onDone();
      } catch (error) {
        setFailure(error.message);
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={10}>
        {failure ? (
          <Notice $tone="danger">
            <CircleAlert size={15} />
            {failure}
          </Notice>
        ) : null}
        <Grid $cols={2}>
          <Field>
            <Label>Category</Label>
            <Select name="category" {...formik.getFieldProps('category')}>
              {AUDIT_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {AUDIT_CATEGORY_LABELS[key] || key}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Severity</Label>
            <Select name="severity" {...formik.getFieldProps('severity')}>
              {SEVERITIES.map((key) => (
                <option key={key} value={key}>
                  {SEVERITY_META[key].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Code</Label>
            <Input
              name="code"
              placeholder="e.g. missing-title"
              {...formik.getFieldProps('code')}
            />
          </Field>
          <Field>
            <Label>Source</Label>
            <Select name="sourceType" {...formik.getFieldProps('sourceType')}>
              {FINDING_SOURCES.map((key) => (
                <option key={key} value={key}>
                  {FINDING_SOURCE_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field style={{ gridColumn: '1 / -1' }}>
            <Label>Title</Label>
            <Input
              name="title"
              placeholder="Short finding title"
              {...formik.getFieldProps('title')}
            />
          </Field>
          <Field style={{ gridColumn: '1 / -1' }}>
            <Label>Description</Label>
            <Textarea
              name="description"
              rows={3}
              placeholder="What was observed"
              {...formik.getFieldProps('description')}
            />
          </Field>
          <Field style={{ gridColumn: '1 / -1' }}>
            <Label>Evidence (optional)</Label>
            <Textarea
              name="evidence"
              rows={2}
              placeholder="Where this came from — page, snippet or note"
              {...formik.getFieldProps('evidence')}
            />
          </Field>
          <Field style={{ gridColumn: '1 / -1' }}>
            <Label>Recommendation</Label>
            <Textarea
              name="recommendation"
              rows={2}
              placeholder="What to do about it"
              {...formik.getFieldProps('recommendation')}
            />
          </Field>
          <Field>
            <Label>Source page (optional)</Label>
            <Input
              name="sourcePage"
              {...formik.getFieldProps('sourcePage')}
            />
          </Field>
          <Field>
            <Label>Assign to (optional)</Label>
            <Select
              name="assignedToUserId"
              {...formik.getFieldProps('assignedToUserId')}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email}
                </option>
              ))}
            </Select>
          </Field>
        </Grid>
        <Actions>
          <Button type="submit" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? <Loader2 size={14} className="spin" /> : null}
            Add finding
          </Button>
        </Actions>
      </Stack>
    </form>
  );
}

function FindingCard({
  auditId,
  finding,
  members,
  projects,
  defaultProjectId,
  canManage,
  timezone,
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [status, setStatus] = useState(finding.status);
  const [assignedToUserId, setAssignedToUserId] = useState(
    finding.assignedToUserId || '',
  );
  const [completionNotes, setCompletionNotes] = useState(
    finding.completionNotes || '',
  );
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [priority, setPriority] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [acceptance, setAcceptance] = useState('');

  const severity = metaFor(SEVERITY_META, finding.severity);
  const statusMeta = metaFor(FINDING_STATUS_META, finding.status);
  const source = metaFor(FINDING_SOURCE_META, finding.sourceType);

  async function saveUpdate() {
    setBusy('update');
    setFailure(null);
    setNotice(null);
    try {
      await apiRequest(
        `/api/workforce/website-audits/${auditId}/findings/${finding.id}`,
        {
          method: 'PATCH',
          body: {
            status,
            assignedToUserId: assignedToUserId || null,
            completionNotes: completionNotes.trim() || null,
            expectedUpdatedAt: finding.updatedAt,
          },
        },
      );
      setNotice('Finding updated.');
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function createTask() {
    setBusy('task');
    setFailure(null);
    setNotice(null);
    try {
      const result = await apiRequest(
        `/api/workforce/website-audits/${auditId}/findings/${finding.id}/task`,
        {
          method: 'POST',
          body: {
            projectId,
            priority: priority || null,
            dueDate: toIsoDate(dueDate),
            acceptanceCriteria: acceptance.trim() || null,
          },
        },
      );
      setNotice(`Task created: ${result.task?.title || 'project task'}.`);
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHead>
        <div>
          <CardTitle>{finding.title}</CardTitle>
          <CardText>
            {finding.code} · {finding.category}
            {finding.sourcePage ? ` · ${finding.sourcePage}` : ''}
          </CardText>
        </div>
        <Actions>
          <Badge $tone={severity.tone}>{severity.label}</Badge>
          <Badge $tone={source.tone}>{source.label}</Badge>
          <Badge $tone={statusMeta.tone}>{statusMeta.label}</Badge>
        </Actions>
      </CardHead>

      {notice ? <Notice $tone="success">{notice}</Notice> : null}
      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          {failure}
        </Notice>
      ) : null}

      <MetaGrid>
        <div>
          <dt>Description</dt>
          <dd>{finding.description}</dd>
        </div>
        {finding.evidence ? (
          <div>
            <dt>Evidence</dt>
            <dd>{finding.evidence}</dd>
          </div>
        ) : null}
        <div>
          <dt>Recommendation</dt>
          <dd>{finding.recommendation}</dd>
        </div>
        <div>
          <dt>Assigned to</dt>
          <dd>{finding.assignedToName || 'Unassigned'}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatDateTime(finding.updatedAt, timezone)}</dd>
        </div>
        {finding.completionNotes ? (
          <div>
            <dt>Completion notes</dt>
            <dd>{finding.completionNotes}</dd>
          </div>
        ) : null}
      </MetaGrid>

      {finding.linkedTaskId ? (
        <Hint>
          Linked task: <strong>{finding.linkedTaskTitle || finding.linkedTaskId}</strong>
          {finding.linkedTaskStatus ? ` · ${finding.linkedTaskStatus}` : ''} ·{' '}
          <Link href="/workspace/tasks">View tasks</Link>
        </Hint>
      ) : null}

      {canManage ? (
        <Stack $gap={12}>
          <div>
            <CardTitle style={{ fontSize: '0.95rem', marginBottom: 8 }}>
              Update finding
            </CardTitle>
            <Grid $cols={2}>
              <Field>
                <Label>Status</Label>
                <Select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {FINDING_STATUS_ORDER.map((key) => (
                    <option key={key} value={key}>
                      {FINDING_STATUS_LABELS[key]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Assigned to</Label>
                <Select
                  value={assignedToUserId}
                  onChange={(event) => setAssignedToUserId(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name || member.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field style={{ gridColumn: '1 / -1' }}>
                <Label>Completion notes</Label>
                <Textarea
                  rows={2}
                  value={completionNotes}
                  onChange={(event) => setCompletionNotes(event.target.value)}
                  placeholder="Required before marking resolved. Record proof the change was verified."
                />
              </Field>
            </Grid>
            <Actions>
              <Button
                type="button"
                onClick={saveUpdate}
                disabled={Boolean(busy)}
              >
                {busy === 'update' ? (
                  <Loader2 size={14} className="spin" />
                ) : null}
                Save update
              </Button>
            </Actions>
          </div>

          {!finding.linkedTaskId ? (
            <div>
              <CardTitle style={{ fontSize: '0.95rem', marginBottom: 8 }}>
                Convert to project task
              </CardTitle>
              <Grid $cols={2}>
                <Field>
                  <Label>Project</Label>
                  <Select
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                  >
                    <option value="">Choose a project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>Priority</Label>
                  <Select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                  >
                    {PRIORITIES.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>Due date (optional)</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </Field>
                <Field style={{ gridColumn: '1 / -1' }}>
                  <Label>Acceptance criteria (optional)</Label>
                  <Textarea
                    rows={2}
                    value={acceptance}
                    onChange={(event) => setAcceptance(event.target.value)}
                    placeholder="Defaults to verifying the recommendation was implemented."
                  />
                </Field>
              </Grid>
              <Actions>
                <Button
                  type="button"
                  onClick={createTask}
                  disabled={Boolean(busy) || !projectId}
                >
                  {busy === 'task' ? (
                    <Loader2 size={14} className="spin" />
                  ) : null}
                  <ListChecks size={14} />
                  Generate task
                </Button>
              </Actions>
            </div>
          ) : null}
        </Stack>
      ) : null}
    </Card>
  );
}

export default function MarketingAuditDetailView({
  audit,
  findings,
  statusCounts,
  sourceCounts,
  members,
  projects,
  canManage,
  timezone,
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const statusMeta = metaFor(AUDIT_STATUS_META, audit.status);
  const openFindings = statusCounts.open + statusCounts.in_progress;

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/marketing/audits">SEO findings</Link> ·{' '}
          {audit.domain}
        </Eyebrow>
        <Title>{audit.domain}</Title>
        <Lead>
          {audit.normalizedUrl}
          {audit.overallScore == null
            ? ''
            : ` · score ${audit.overallScore}/100 (heuristic)`}
        </Lead>
      </Header>
      <MarketingNav />

      <Notice $tone="info">
        <span>
          Findings keep their source. Verified findings come from the audit
          engine; AI suggestions and unverified notes are labelled and are not
          measured facts. A resolved finding or a task is not proof the live
          website changed.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Findings</StatLabel>
          <StatValue>{findings.length}</StatValue>
          <StatNote>On this audit</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Open</StatLabel>
          <StatValue>{openFindings}</StatValue>
          <StatNote>Open or in progress</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Resolved</StatLabel>
          <StatValue>{statusCounts.resolved || 0}</StatValue>
          <StatNote>Verified by completion notes</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Audit status</StatLabel>
          <StatValue style={{ fontSize: '0.95rem' }}>
            <Badge $tone={statusMeta.tone}>{statusMeta.label}</Badge>
          </StatValue>
          <StatNote>{sourceCounts.verified || 0} verified findings</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Findings</CardTitle>
            <CardText>
              Ordered oldest first. Add findings manually or convert them into
              project tasks.
            </CardText>
          </div>
          {canManage ? (
            <Actions>
              <Button
                type="button"
                $variant="primary"
                onClick={() => setShowAdd((current) => !current)}
              >
                <Plus size={15} />
                {showAdd ? 'Close form' : 'Add finding'}
              </Button>
            </Actions>
          ) : null}
        </CardHead>

        {showAdd && canManage ? (
          <div
            style={{
              padding: 16,
              border: '1px solid #E5EAF1',
              borderRadius: 12,
              background: '#FFFFFF',
              marginBottom: 12,
            }}
          >
            <CardTitle style={{ marginBottom: 12 }}>New finding</CardTitle>
            <FindingForm
              auditId={audit.id}
              members={members}
              onDone={() => {
                setShowAdd(false);
                router.refresh();
              }}
            />
          </div>
        ) : null}

        {findings.length === 0 ? (
          <EmptyState>
            <ListChecks size={17} aria-hidden="true" />
            <div>
              <h3>No findings recorded</h3>
              <p>
                {canManage
                  ? 'Add a finding above. Only what is actually observed should be recorded.'
                  : 'No findings have been recorded for this audit.'}
              </p>
            </div>
          </EmptyState>
        ) : null}
      </Card>

      {findings.map((finding) => (
        <FindingCard
          key={finding.id}
          auditId={audit.id}
          finding={finding}
          members={members}
          projects={projects}
          defaultProjectId={audit.projectId}
          canManage={canManage}
          timezone={timezone}
        />
      ))}

      <Hint>
        Audit: {audit.requestedUrl}. Captured {formatDateTime(audit.createdAt, timezone)}.
        {audit.errorMessage ? ` Last error: ${audit.errorMessage}` : ''}
      </Hint>
    </Page>
  );
}
