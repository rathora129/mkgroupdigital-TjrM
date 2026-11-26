'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Loader2, Sparkles } from 'lucide-react';
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
  Input,
  Label,
  Lead,
  Notice,
  Page,
  Pre,
  Stack,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import { MetaGrid, SmallButton, Timeline, TimelineItem } from '@/components/workspace/phase2c/ui';
import { apiRequest } from '@/lib/ai/client';
import { formatDateTime } from '@/lib/ai/format';
import { CONTENT_TYPE_LABELS } from '@/lib/marketing/constants';
import MarketingNav from '../MarketingNav';
import { CONTENT_STATUS_META, dateInputValue, metaFor, toIsoDate } from '../meta';

export default function ContentDetailView({
  detail,
  canManage,
  canApprove,
  canExecute,
  timezone,
}) {
  const router = useRouter();
  const { item, versions, latest, approved } = detail;
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [scheduleDate, setScheduleDate] = useState(dateInputValue(item.scheduledFor));
  const [publishNote, setPublishNote] = useState('');
  const [runId, setRunId] = useState('');
  const [draftBody, setDraftBody] = useState(latest?.body || '');
  const [changeNote, setChangeNote] = useState('');

  const status = metaFor(CONTENT_STATUS_META, item.status);
  const readOnly = ['published', 'cancelled'].includes(item.status);

  async function run(action, extra = {}) {
    setBusy(action);
    setFailure(null);
    setNotice(null);
    try {
      const result = await apiRequest(
        `/api/workforce/marketing/content/${item.id}/actions`,
        {
          method: 'POST',
          body: {
            action,
            expectedUpdatedAt: item.updatedAt,
            ...extra,
          },
        },
      );
      setNotice(result?.note || result?.message || 'Action recorded.');
      setFeedback('');
      setPublishNote('');
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function saveVersion(event) {
    event.preventDefault();
    setBusy('version');
    setFailure(null);
    setNotice(null);
    try {
      const result = await apiRequest(
        `/api/workforce/marketing/content/${item.id}/versions`,
        {
          method: 'POST',
          body: {
            body: draftBody,
            changeNote: changeNote.trim() || null,
            expectedVersion: item.latestVersion,
          },
        },
      );
      setNotice(`Saved version ${result.version}.`);
      setChangeNote('');
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    await run('regenerate');
  }

  const canEdit = canManage && !readOnly;

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/marketing/content">Content</Link> ·{' '}
          {item.clientReference || item.clientName}
        </Eyebrow>
        <Title>{item.title}</Title>
        <Lead>
          {item.clientName} ·{' '}
          {CONTENT_TYPE_LABELS[item.contentType] || item.contentType} ·{' '}
          {item.language}
        </Lead>
      </Header>
      <MarketingNav />

      {notice ? <Notice $tone="success">{notice}</Notice> : null}
      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          {failure}
        </Notice>
      ) : null}
      <Notice $tone="info">
        <span>
          Internal workflow only. Approved and scheduled content is not posted,
          emailed or sent to any platform.
        </span>
      </Notice>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Record</CardTitle>
            <CardText>
              {item.campaignName ? `${item.campaignName} · ` : ''}
              Updated {formatDateTime(item.updatedAt, timezone)}
            </CardText>
          </div>
          <Badge $tone={status.tone}>{status.label}</Badge>
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Latest version</dt>
            <dd>v{item.latestVersion}</dd>
          </div>
          <div>
            <dt>Approved version</dt>
            <dd>{item.approvedVersion ? `v${item.approvedVersion}` : 'None'}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{item.ownerName || 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Planned date</dt>
            <dd>{item.scheduledFor ? dateInputValue(item.scheduledFor) : '—'}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{item.dueDate ? dateInputValue(item.dueDate) : '—'}</dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd>{item.targetPlatform || 'Not set'}</dd>
          </div>
          <div>
            <dt>Target keyword</dt>
            <dd>{item.targetKeyword || '—'}</dd>
          </div>
          <div>
            <dt>Generation</dt>
            <dd>
              {item.generationSource === 'ai' ? 'AI-assisted draft' : 'Human-written'}
            </dd>
          </div>
        </MetaGrid>
        {item.reviewFeedback ? (
          <Notice $tone="warning">
            <span>
              <strong>Review feedback:</strong> {item.reviewFeedback}
            </span>
          </Notice>
        ) : null}
        {item.publishNote ? (
          <Hint>Publication note: {item.publishNote}</Hint>
        ) : null}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Current draft (v{item.latestVersion})</CardTitle>
            <CardText>
              Latest version body. Editing creates a new version; previous
              versions remain stored.
            </CardText>
          </div>
        </CardHead>
        <Pre>{latest?.body || 'No version body recorded.'}</Pre>
      </Card>

      {canEdit ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Save a new version</CardTitle>
              <CardText>
                Appending a version after review returns the item to draft for a
                fresh review cycle.
              </CardText>
            </div>
          </CardHead>
          <form onSubmit={saveVersion}>
            <Stack $gap={10}>
              <Label htmlFor="draftBody">Version body</Label>
              <Textarea
                id="draftBody"
                rows={8}
                value={draftBody}
                onChange={(event) => setDraftBody(event.target.value)}
              />
              <Label htmlFor="changeNote">Change note (optional)</Label>
              <Input
                id="changeNote"
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
              />
              <Actions>
                <Button
                  type="submit"
                  disabled={busy === 'version' || !draftBody.trim()}
                >
                  {busy === 'version' ? (
                    <Loader2 size={14} className="spin" />
                  ) : null}
                  Save version v{item.latestVersion + 1}
                </Button>
              </Actions>
            </Stack>
          </form>
        </Card>
      ) : null}

      {canEdit || canApprove || canExecute ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Workflow actions</CardTitle>
              <CardText>
                Only the next permitted step is offered. Each action is audited.
              </CardText>
            </div>
          </CardHead>
          <Stack $gap={12}>
            <Actions>
              {canManage && item.status === 'idea' ? (
                <SmallButton
                  type="button"
                  onClick={() => run('start_draft')}
                  disabled={Boolean(busy)}
                >
                  Move idea to draft
                </SmallButton>
              ) : null}
              {canManage && ['draft', 'changes_requested'].includes(item.status) ? (
                <SmallButton
                  type="button"
                  onClick={() => run('submit')}
                  disabled={Boolean(busy)}
                >
                  Submit for review
                </SmallButton>
              ) : null}
              {canApprove && item.status === 'in_review' ? (
                <SmallButton
                  type="button"
                  onClick={() => run('approve')}
                  disabled={Boolean(busy)}
                >
                  Approve latest version
                </SmallButton>
              ) : null}
              {canManage && !readOnly ? (
                <SmallButton
                  type="button"
                  $variant="danger"
                  onClick={() => run('cancel')}
                  disabled={Boolean(busy)}
                >
                  Cancel content
                </SmallButton>
              ) : null}
              {canManage ? (
                <SmallButton
                  type="button"
                  onClick={regenerate}
                  disabled={Boolean(busy) || readOnly}
                >
                  <Sparkles size={13} />
                  Add suggestion version
                </SmallButton>
              ) : null}
            </Actions>

            {canApprove && item.status === 'in_review' ? (
              <Stack $gap={6}>
                <Label htmlFor="feedback">Rejection feedback</Label>
                <Textarea
                  id="feedback"
                  rows={2}
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Required when returning the draft for changes"
                />
                <Actions>
                  <SmallButton
                    type="button"
                    $variant="danger"
                    onClick={() => run('reject', { feedback })}
                    disabled={Boolean(busy) || !feedback.trim()}
                  >
                    Request changes
                  </SmallButton>
                </Actions>
              </Stack>
            ) : null}

            {canManage && item.status === 'approved' ? (
              <Stack $gap={6}>
                <Label htmlFor="scheduleDate">Internal schedule date</Label>
                <Input
                  id="scheduleDate"
                  type="date"
                  value={scheduleDate}
                  onChange={(event) => setScheduleDate(event.target.value)}
                />
                <Actions>
                  <SmallButton
                    type="button"
                    onClick={() =>
                      run('schedule', {
                        scheduledFor: toIsoDate(scheduleDate),
                      })
                    }
                    disabled={Boolean(busy) || !scheduleDate}
                  >
                    Schedule internally
                  </SmallButton>
                </Actions>
              </Stack>
            ) : null}

            {canManage && item.status === 'scheduled' ? (
              <Actions>
                <SmallButton
                  type="button"
                  onClick={() => run('unschedule')}
                  disabled={Boolean(busy)}
                >
                  Return to approved
                </SmallButton>
              </Actions>
            ) : null}

            {canExecute && item.status === 'scheduled' ? (
              <Stack $gap={6}>
                <Label htmlFor="publishNote">
                  Publication or failure evidence
                </Label>
                <Textarea
                  id="publishNote"
                  rows={2}
                  value={publishNote}
                  onChange={(event) => setPublishNote(event.target.value)}
                  placeholder="Record what was actually published elsewhere, or why it did not proceed"
                />
                <Actions>
                  <SmallButton
                    type="button"
                    onClick={() => run('mark_published', { publishNote })}
                    disabled={Boolean(busy) || !publishNote.trim()}
                  >
                    Record as published
                  </SmallButton>
                  <SmallButton
                    type="button"
                    $variant="danger"
                    onClick={() => run('record_failure', { publishNote })}
                    disabled={Boolean(busy) || !publishNote.trim()}
                  >
                    Record failure
                  </SmallButton>
                </Actions>
              </Stack>
            ) : null}
          </Stack>
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Import a completed AI draft</CardTitle>
              <CardText>
                Only completed runs with text output can be imported. Every
                imported version records its run, provider and model.
              </CardText>
            </div>
          </CardHead>
          <Stack $gap={8}>
            <Label htmlFor="runId">Agent run ID</Label>
            <Input
              id="runId"
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
              placeholder="Paste the run identifier"
            />
            <Actions>
              <Button
                type="button"
                onClick={() => run('import_agent_run', { runId })}
                disabled={Boolean(busy) || !runId.trim()}
              >
                Import as new version
              </Button>
            </Actions>
          </Stack>
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Version history</CardTitle>
            <CardText>
              {versions.length} stored version(s). Approved content is never
              overwritten; edits append.
            </CardText>
          </div>
        </CardHead>
        {versions.length === 0 ? (
          <Hint>No versions stored.</Hint>
        ) : (
          <Timeline>
            {versions.map((version) => (
              <TimelineItem key={version.id}>
                <strong>
                  v{version.version}
                  {version.version === item.latestVersion ? ' · latest' : ''}
                  {version.version === item.approvedVersion ? ' · approved' : ''}
                </strong>
                <span>
                  {version.generationSource === 'ai' ? 'AI-assisted' : 'Human'} ·{' '}
                  {version.createdByName || 'Unknown'} ·{' '}
                  {formatDateTime(version.createdAt, timezone)}
                </span>
                {version.changeNote ? <em>{version.changeNote}</em> : null}
              </TimelineItem>
            ))}
          </Timeline>
        )}
        {approved ? (
          <Hint>
            The approved version (v{approved.version}) remains the reference for
            review. Newer drafts do not alter it.
          </Hint>
        ) : null}
      </Card>
    </Page>
  );
}
