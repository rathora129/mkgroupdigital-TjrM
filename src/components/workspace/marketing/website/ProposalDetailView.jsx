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
  Grid,
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
import MarketingNav from '../MarketingNav';
import { PROPOSAL_STATUS_META, metaFor } from '../meta';

export default function ProposalDetailView({
  detail,
  canManage,
  canApprove,
  canExecute,
  timezone,
}) {
  const router = useRouter();
  const { proposal, versions, latest } = detail;
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [evidence, setEvidence] = useState('');
  const [executionNotes, setExecutionNotes] = useState('');
  const [runId, setRunId] = useState('');
  const [draftBody, setDraftBody] = useState(latest?.body || '');
  const [changeNote, setChangeNote] = useState('');

  const status = metaFor(PROPOSAL_STATUS_META, proposal.status);
  const closed = ['executed', 'cancelled'].includes(proposal.status);

  async function run(action, extra = {}) {
    setBusy(action);
    setFailure(null);
    setNotice(null);
    try {
      const result = await apiRequest(
        `/api/workforce/marketing/proposals/${proposal.id}/actions`,
        {
          method: 'POST',
          body: {
            action,
            expectedUpdatedAt: proposal.updatedAt,
            ...extra,
          },
        },
      );
      setNotice(result?.note || result?.message || 'Action recorded.');
      setFeedback('');
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
        `/api/workforce/marketing/proposals/${proposal.id}/versions`,
        {
          method: 'POST',
          body: {
            body: draftBody,
            changeNote: changeNote.trim() || null,
            expectedVersion: proposal.latestVersion,
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

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/marketing/website">Website changes</Link> ·{' '}
          {proposal.clientReference || proposal.clientName}
        </Eyebrow>
        <Title>{proposal.title}</Title>
        <Lead>
          {proposal.clientName}
          {proposal.pageUrl ? ` · ${proposal.pageUrl}` : ''}
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
          Approving this proposal does not edit the website. Mark it executed
          only after someone applies the change and records evidence.
        </span>
      </Notice>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Proposal record</CardTitle>
            <CardText>
              Updated {formatDateTime(proposal.updatedAt, timezone)}
            </CardText>
          </div>
          <Badge $tone={status.tone}>{status.label}</Badge>
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Client</dt>
            <dd>{proposal.clientName}</dd>
          </div>
          <div>
            <dt>Page</dt>
            <dd>{proposal.pageUrl || 'Not linked'}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{proposal.ownerName || 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Latest version</dt>
            <dd>v{proposal.latestVersion}</dd>
          </div>
          <div>
            <dt>Approved</dt>
            <dd>
              {proposal.approvedAt
                ? formatDateTime(proposal.approvedAt, timezone)
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Executed</dt>
            <dd>
              {proposal.executedAt
                ? formatDateTime(proposal.executedAt, timezone)
                : '—'}
            </dd>
          </div>
        </MetaGrid>
        {proposal.rejectionFeedback ? (
          <Notice $tone="warning">
            <span>
              <strong>Rejection feedback:</strong> {proposal.rejectionFeedback}
            </span>
          </Notice>
        ) : null}
        {proposal.executionEvidence ? (
          <Notice $tone="success">
            <span>
              <strong>Execution evidence:</strong> {proposal.executionEvidence}
              {proposal.executionNotes ? ` · ${proposal.executionNotes}` : ''}
            </span>
          </Notice>
        ) : null}
      </Card>

      <Grid $cols={2}>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Original content</CardTitle>
              <CardText>Preserved as recorded before the proposal.</CardText>
            </div>
          </CardHead>
          <Pre>{proposal.currentContent || 'No original content recorded.'}</Pre>
        </Card>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Proposed content (v{proposal.latestVersion})</CardTitle>
              <CardText>Latest proposal body.</CardText>
            </div>
          </CardHead>
          <Pre>{latest?.body || proposal.proposedContent}</Pre>
        </Card>
      </Grid>

      {canManage && !closed ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Save a new proposal version</CardTitle>
              <CardText>
                Each save appends a version; earlier versions and the original
                content remain stored.
              </CardText>
            </div>
          </CardHead>
          <form onSubmit={saveVersion}>
            <Stack $gap={10}>
              <Label htmlFor="draftBody">Proposed content</Label>
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
                  Save version v{proposal.latestVersion + 1}
                </Button>
              </Actions>
            </Stack>
          </form>
        </Card>
      ) : null}

      {canManage || canApprove || canExecute ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Workflow actions</CardTitle>
              <CardText>Each decision is recorded in the audit log.</CardText>
            </div>
          </CardHead>
          <Stack $gap={12}>
            <Actions>
              {canManage && proposal.status === 'draft' ? (
                <SmallButton
                  type="button"
                  onClick={() => run('submit')}
                  disabled={Boolean(busy)}
                >
                  Submit for review
                </SmallButton>
              ) : null}
              {canApprove && proposal.status === 'awaiting_review' ? (
                <SmallButton
                  type="button"
                  onClick={() => run('approve')}
                  disabled={Boolean(busy)}
                >
                  Approve proposal
                </SmallButton>
              ) : null}
              {canExecute && proposal.status === 'approved' ? (
                <SmallButton
                  type="button"
                  onClick={() => run('start_execution')}
                  disabled={Boolean(busy)}
                >
                  Mark execution started
                </SmallButton>
              ) : null}
              {canManage && !closed ? (
                <SmallButton
                  type="button"
                  $variant="danger"
                  onClick={() => run('cancel')}
                  disabled={Boolean(busy)}
                >
                  Cancel proposal
                </SmallButton>
              ) : null}
              {canManage ? (
                <SmallButton
                  type="button"
                  onClick={() => run('regenerate')}
                  disabled={Boolean(busy) || closed}
                >
                  <Sparkles size={13} />
                  Add suggestion version
                </SmallButton>
              ) : null}
            </Actions>

            {canApprove && proposal.status === 'awaiting_review' ? (
              <Stack $gap={6}>
                <Label htmlFor="feedback">Rejection feedback</Label>
                <Textarea
                  id="feedback"
                  rows={2}
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                />
                <Actions>
                  <SmallButton
                    type="button"
                    $variant="danger"
                    onClick={() => run('reject', { feedback })}
                    disabled={Boolean(busy) || !feedback.trim()}
                  >
                    Reject proposal
                  </SmallButton>
                </Actions>
              </Stack>
            ) : null}

            {canExecute && ['approved', 'executing'].includes(proposal.status) ? (
              <Stack $gap={6}>
                <Label htmlFor="evidence">
                  Execution evidence (who changed what, where it was verified)
                </Label>
                <Textarea
                  id="evidence"
                  rows={3}
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                />
                <Label htmlFor="executionNotes">Notes (optional)</Label>
                <Textarea
                  id="executionNotes"
                  rows={2}
                  value={executionNotes}
                  onChange={(event) => setExecutionNotes(event.target.value)}
                />
                <Actions>
                  <SmallButton
                    type="button"
                    onClick={() =>
                      run('record_execution', {
                        evidence,
                        notes: executionNotes || null,
                      })
                    }
                    disabled={Boolean(busy) || !evidence.trim()}
                  >
                    Record execution complete
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
              <CardTitle>Import a completed AI suggestion</CardTitle>
              <CardText>
                Only completed runs with text output are imported, always as a
                new version.
              </CardText>
            </div>
          </CardHead>
          <Stack $gap={8}>
            <Label htmlFor="runId">Agent run ID</Label>
            <Input
              id="runId"
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
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
            <CardText>{versions.length} stored version(s).</CardText>
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
                  {version.version === proposal.latestVersion ? ' · latest' : ''}
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
      </Card>
    </Page>
  );
}
