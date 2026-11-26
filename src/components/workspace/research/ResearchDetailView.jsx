'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Ban,
  BadgeCheck,
  CircleAlert,
  FileSearch,
  Loader2,
  Sparkles,
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
  EmptyState,
  Eyebrow,
  Header,
  Hint,
  Lead,
  LinkButton,
  Notice,
  Page,
  Pre,
  Row,
  Stack,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import {
  MetaGrid,
  SmallButton,
  SmallLink,
  Subhead,
} from '@/components/workspace/phase2c/ui';
import {
  RESEARCH_CATEGORY_LABELS,
  RESEARCH_STATUS_META,
  RESEARCH_SUBJECT_LABELS,
  RESEARCH_VERIFICATION_META,
  metaFor,
} from '@/components/workspace/phase2c/meta';

const SOURCE_KIND_LABELS = {
  website: 'Fetched website',
  lead_record: 'CRM lead record',
  ai_reference: 'Referenced, not fetched',
};

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

export default function ResearchDetailView({
  detail,
  canCancel,
  timezone,
}) {
  const router = useRouter();
  const { job, findings, sources, run } = detail;
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);

  const status = metaFor(RESEARCH_STATUS_META, job.status);
  const subject = job.companyName || job.websiteUrl || 'Linked CRM lead';

  const grouped = Object.keys(RESEARCH_CATEGORY_LABELS)
    .map((category) => ({
      category,
      items: findings.filter((finding) => finding.category === category),
    }))
    .filter((group) => group.items.length > 0);

  async function cancelJob() {
    setBusy(true);
    setFailure(null);
    try {
      await apiRequest(`/api/workforce/research/${job.id}/cancel`, {
        method: 'POST',
      });
      setConfirmCancel(false);
      setNotice('Cancellation requested. The worker stops at the next safe point.');
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Row>
        <SmallLink href="/workspace/research">← All research</SmallLink>
        <Badge $tone={status.tone}>{status.label}</Badge>
        {job.leadId ? (
          <SmallLink href={`/workspace/leads/${job.leadId}`}>
            Open linked lead
          </SmallLink>
        ) : null}
      </Row>

      <Header>
        <Eyebrow>Research job</Eyebrow>
        <Title>{subject}</Title>
        <Row>
          {job.websiteUrl ? (
            isHttpUrl(job.websiteUrl) ? (
              <a
                href={job.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.8rem', fontWeight: 600 }}
              >
                {job.websiteUrl}
              </a>
            ) : (
              <span style={{ fontSize: '0.8rem' }}>{job.websiteUrl}</span>
            )
          ) : null}
          <Badge $tone="muted">
            {RESEARCH_SUBJECT_LABELS[job.subjectType] || job.subjectType}
          </Badge>
        </Row>
        <Lead>{job.objective}</Lead>
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
      {job.status === 'failed' ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          <span>
            <strong>This research job failed.</strong>{' '}
            {job.errorMessage || 'No further detail was recorded.'}
          </span>
        </Notice>
      ) : null}
      {job.status === 'awaiting_approval' ? (
        <Notice $tone="warning">
          <BadgeCheck size={15} />
          The linked agent run is waiting for human approval. Approve or reject
          it in the approvals queue.
        </Notice>
      ) : null}
      {job.status === 'queued' || job.status === 'running' ? (
        <Notice $tone="info">
          <Loader2 size={15} className="spin" />
          The background worker is processing this job. Findings appear here
          when the run finishes; refresh this page for progress.
        </Notice>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Job record</CardTitle>
            <CardText>
              Requested {formatDateTime(job.createdAt, timezone)}. Runs execute
              in a separate worker, never inside a web request.
            </CardText>
          </div>
          <Actions>
            {run?.run?.id ? (
              <SmallLink href={`/workspace/ai-workforce/runs/${run.run.id}`}>
                Open agent run
              </SmallLink>
            ) : null}
            {canCancel && detail.canCancel ? (
              <SmallButton
                type="button"
                $variant="danger"
                onClick={() => setConfirmCancel(true)}
                disabled={busy}
              >
                <Ban size={13} />
                Cancel job
              </SmallButton>
            ) : null}
          </Actions>
        </CardHead>

        {confirmCancel ? (
          <Notice $tone="danger">
            <span>
              Cancel this research job? A linked run is also cancelled if it is
              still open.
            </span>
            <Row>
              <SmallButton
                type="button"
                $variant="danger"
                onClick={cancelJob}
                disabled={busy}
              >
                {busy ? <Loader2 size={13} className="spin" /> : null}
                Confirm cancel
              </SmallButton>
              <SmallButton
                type="button"
                $variant="ghost"
                onClick={() => setConfirmCancel(false)}
              >
                Keep running
              </SmallButton>
            </Row>
          </Notice>
        ) : null}

        <MetaGrid>
          <div>
            <dt>Status</dt>
            <dd>{status.label}</dd>
          </div>
          <div>
            <dt>Requested by</dt>
            <dd>{job.requestedByName || job.requestedByEmail || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{formatDateTime(job.startedAt, timezone)}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{formatDateTime(job.completedAt, timezone)}</dd>
          </div>
          <div>
            <dt>Sources</dt>
            <dd>{job.sourceCount}</dd>
          </div>
          <div>
            <dt>Findings</dt>
            <dd>{job.output?.findingCount ?? findings.length}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{run?.agentName || '—'}</dd>
          </div>
          <div>
            <dt>Run status</dt>
            <dd>{run?.run?.status || '—'}</dd>
          </div>
        </MetaGrid>

        {job.output?.summary ? (
          <>
            <Subhead>Summary</Subhead>
            <Pre>{job.output.summary}</Pre>
          </>
        ) : null}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Findings</CardTitle>
            <CardText>
              Each finding carries exactly one verification label. A brief is a
              draft for a person to check, not a guarantee about the business.
            </CardText>
          </div>
        </CardHead>

        {grouped.length === 0 ? (
          <EmptyState>
            <FileSearch size={17} aria-hidden="true" />
            <div>
              <h3>No findings stored yet</h3>
              <p>
                {job.status === 'completed'
                  ? 'The run completed without structured findings. Check the agent run output for the raw response.'
                  : 'Findings appear when the job finishes.'}
              </p>
            </div>
          </EmptyState>
        ) : (
          grouped.map((group) => (
            <section key={group.category}>
              <Subhead>
                {RESEARCH_CATEGORY_LABELS[group.category]} ({group.items.length})
              </Subhead>
              <Stack $gap={10}>
                {group.items.map((finding) => {
                  const verification = metaFor(
                    RESEARCH_VERIFICATION_META,
                    finding.verification,
                  );
                  return (
                    <div
                      key={finding.id}
                      style={{
                        padding: 12,
                        border: '1px solid #E5EAF1',
                        borderRadius: 10,
                        background: '#F8FAFC',
                      }}
                    >
                      <Row>
                        <strong style={{ fontSize: '0.84rem' }}>
                          {finding.title}
                        </strong>
                        <Badge $tone={verification.tone}>
                          {verification.label}
                        </Badge>
                      </Row>
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: '0.8rem',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {finding.detail}
                      </p>
                      {finding.sourceUrl ? (
                        <p style={{ margin: '6px 0 0', fontSize: '0.74rem' }}>
                          Source:{' '}
                          {isHttpUrl(finding.sourceUrl) ? (
                            <a
                              href={finding.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {finding.sourceUrl}
                            </a>
                          ) : (
                            finding.sourceUrl
                          )}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </Stack>
            </section>
          ))
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Sources</CardTitle>
            <CardText>
              Only the supplied website and linked CRM record are fetched.
              Unfetched AI references are labelled.
            </CardText>
          </div>
        </CardHead>
        {sources.length === 0 ? (
          <Hint>No sources were recorded for this job.</Hint>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Kind</th>
                  <th>HTTP</th>
                  <th>Retrieved</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id}>
                    <td>
                      {isHttpUrl(source.url) ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {source.title || source.url}
                        </a>
                      ) : (
                        <span>{source.title || source.url}</span>
                      )}
                      {source.excerpt ? (
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {source.excerpt.slice(0, 160)}
                          {source.excerpt.length > 160 ? '…' : ''}
                        </div>
                      ) : null}
                    </td>
                    <td>{SOURCE_KIND_LABELS[source.kind] || source.kind}</td>
                    <td>{source.httpStatus ?? '—'}</td>
                    <td>{formatDateTime(source.retrievedAt, timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Hint>
        <Sparkles size={13} style={{ verticalAlign: '-2px' }} /> Research output
        is generated by a configured AI provider. Verify anything labelled AI
        analysis before relying on it.
      </Hint>
    </Page>
  );
}
