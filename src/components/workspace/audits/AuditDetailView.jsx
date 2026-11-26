'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ban,
  CircleAlert,
  Download,
  FileSearch,
  Gauge,
  Loader2,
  Globe2,
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
  Notice,
  Page,
  Pre,
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
  Title,
} from '@/components/workspace/ai/primitives';
import {
  MetaGrid,
  LogList,
  SmallButton,
  SmallLink,
  Subhead,
  TwoCol,
} from '@/components/workspace/phase2c/ui';
import {
  AUDIT_STATUS_META,
  SEVERITY_META,
  SEVERITY_ORDER,
  deltaLabel,
  formatBytes,
  formatMs,
  metaFor,
} from '@/components/workspace/phase2c/meta';

const OPEN_STATUSES = new Set(['queued', 'running']);

function scoreTone(score) {
  if (typeof score !== 'number') return 'muted';
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

export default function AuditDetailView({ detail, canCancel, timezone }) {
  const router = useRouter();
  const { audit, pages, findings, logs, comparison, severityCounts } = detail;

  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);

  const status = metaFor(AUDIT_STATUS_META, audit.status);
  const categoryLabels = detail.categoryLabels || {};

  const visibleFindings = useMemo(
    () =>
      findings.filter(
        (finding) =>
          (!severity || finding.severity === severity) &&
          (!category || finding.category === category),
      ),
    [findings, severity, category],
  );

  const sortedFindings = useMemo(() => {
    const rank = (value) => {
      const index = SEVERITY_ORDER.indexOf(value);
      return index === -1 ? SEVERITY_ORDER.length : index;
    };
    return [...visibleFindings].sort((left, right) => {
      const bySeverity = rank(left.severity) - rank(right.severity);
      if (bySeverity !== 0) return bySeverity;
      return String(left.category).localeCompare(String(right.category));
    });
  }, [visibleFindings]);

  const categoryScores =
    audit.categoryScores && typeof audit.categoryScores === 'object'
      ? audit.categoryScores
      : {};

  async function cancelAudit() {
    setBusy(true);
    setFailure(null);
    try {
      await apiRequest(`/api/workforce/website-audits/${audit.id}/cancel`, {
        method: 'POST',
      });
      setConfirmCancel(false);
      setNotice(
        'Cancellation requested. A running audit stops at the next safe point.',
      );
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      scoringNote:
        audit.scoringMethod ||
        'Heuristic penalty model. Not a Lighthouse, PageSpeed Insights or Core Web Vitals measurement.',
      audit,
      categoryScores,
      severityCounts,
      comparison,
      pages,
      findings,
      logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `website-audit-${audit.domain || 'audit'}-${audit.id}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Page>
      <Row>
        <SmallLink href="/workspace/website-audits">← All audits</SmallLink>
        <Badge $tone={status.tone}>{status.label}</Badge>
        {audit.cancelRequested && OPEN_STATUSES.has(audit.status) ? (
          <Badge $tone="warning">Cancellation requested</Badge>
        ) : null}
      </Row>

      <Header>
        <Eyebrow>Website audit</Eyebrow>
        <Title>{audit.domain}</Title>
        <Row>
          {audit.normalizedUrl ? (
            <a
              href={audit.normalizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.8rem', fontWeight: 600 }}
            >
              {audit.normalizedUrl}
            </a>
          ) : null}
          <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
            Requested by{' '}
            {audit.requestedByName || audit.requestedByEmail || 'unknown'}
          </span>
        </Row>
        <Lead>
          {audit.status === 'completed'
            ? `${audit.pagesScanned} page(s) scanned out of a maximum of ${audit.maxPages}.`
            : `Maximum ${audit.maxPages} page(s). Audit runs in the background worker.`}
        </Lead>
      </Header>

      {notice ? <Notice $tone="success">{notice}</Notice> : null}
      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          {failure}
        </Notice>
      ) : null}
      {audit.status === 'failed' ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          <span>
            <strong>This audit failed.</strong>{' '}
            {audit.errorMessage || 'No further detail was recorded.'}
          </span>
        </Notice>
      ) : null}
      {OPEN_STATUSES.has(audit.status) ? (
        <Notice $tone="info">
          <Loader2 size={15} className="spin" />
          The worker is processing this audit. The page is server-rendered, so
          refresh to see new pages, findings and logs.
        </Notice>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Audit controls</CardTitle>
            <CardText>
              Started {formatDateTime(audit.startedAt, timezone)} · Completed{' '}
              {formatDateTime(audit.completedAt, timezone)}
            </CardText>
          </div>
          <Actions>
            <Button type="button" onClick={exportJson}>
              <Download size={14} />
              Export JSON
            </Button>
            {canCancel && detail.canCancel ? (
              <SmallButton
                type="button"
                $variant="danger"
                onClick={() => setConfirmCancel(true)}
                disabled={busy}
              >
                <Ban size={13} />
                Cancel audit
              </SmallButton>
            ) : null}
          </Actions>
        </CardHead>

        {confirmCancel ? (
          <Notice $tone="danger">
            <span>
              Cancel this audit? A queued audit stops immediately; a running
              audit stops at the next safe point and keeps the findings already
              recorded.
            </span>
            <Row>
              <SmallButton
                type="button"
                $variant="danger"
                onClick={cancelAudit}
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
            <dt>Requested URL</dt>
            <dd>{audit.requestedUrl}</dd>
          </div>
          <div>
            <dt>Normalized URL</dt>
            <dd>{audit.normalizedUrl}</dd>
          </div>
          <div>
            <dt>Pages scanned</dt>
            <dd>
              {audit.pagesScanned || 0} / {audit.maxPages}
            </dd>
          </div>
          <div>
            <dt>Requested</dt>
            <dd>{formatDateTime(audit.createdAt, timezone)}</dd>
          </div>
          <div>
            <dt>Findings</dt>
            <dd>{findings.length}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{audit.overallScore == null ? 'Not scored' : `${audit.overallScore}/100`}</dd>
          </div>
        </MetaGrid>
      </Card>

      {audit.status === 'completed' ? (
        <>
          <StatGrid>
            <StatCard>
              <StatLabel>Overall score</StatLabel>
              <StatValue>
                {audit.overallScore == null ? '—' : `${audit.overallScore}/100`}
              </StatValue>
              <StatNote>Heuristic penalty model</StatNote>
            </StatCard>
            <StatCard>
              <StatLabel>Critical</StatLabel>
              <StatValue>{severityCounts.critical || 0}</StatValue>
              <StatNote>Fix first</StatNote>
            </StatCard>
            <StatCard>
              <StatLabel>High</StatLabel>
              <StatValue>{severityCounts.high || 0}</StatValue>
              <StatNote>Material issues</StatNote>
            </StatCard>
            <StatCard>
              <StatLabel>Medium / low</StatLabel>
              <StatValue>
                {(severityCounts.medium || 0) + (severityCounts.low || 0)}
              </StatValue>
              <StatNote>{severityCounts.info || 0} informational</StatNote>
            </StatCard>
          </StatGrid>

          <TwoCol>
            <Card>
              <CardHead>
                <div>
                  <CardTitle>Category scores</CardTitle>
                  <CardText>
                    Calculated from the severity of findings recorded in each
                    category, using the documented penalty weights.
                  </CardText>
                </div>
                <Gauge size={16} aria-hidden="true" />
              </CardHead>
              {Object.keys(categoryScores).length === 0 ? (
                <Hint>No category score was stored for this audit.</Hint>
              ) : (
                <Stack $gap={8}>
                  {Object.entries(categoryScores).map(([key, value]) => (
                    <Row key={key}>
                      <span
                        style={{
                          flex: 1,
                          fontSize: '0.8rem',
                          color: '#334155',
                        }}
                      >
                        {categoryLabels[key] || key}
                      </span>
                      <Badge $tone={scoreTone(value)}>
                        {typeof value === 'number' ? `${value}/100` : '—'}
                      </Badge>
                    </Row>
                  ))}
                </Stack>
              )}
            </Card>

            <Card>
              <CardHead>
                <div>
                  <CardTitle>Historical comparison</CardTitle>
                  <CardText>
                    Compared with the previous completed audit of the same
                    domain.
                  </CardText>
                </div>
              </CardHead>
              {comparison ? (
                <Stack $gap={8}>
                  <Row>
                    <Badge
                      $tone={
                        comparison.delta > 0
                          ? 'success'
                          : comparison.delta < 0
                            ? 'danger'
                            : 'muted'
                      }
                    >
                      {deltaLabel(comparison.delta)}
                    </Badge>
                  </Row>
                  <MetaGrid>
                    <div>
                      <dt>Previous score</dt>
                      <dd>
                        {comparison.previousOverallScore == null
                          ? '—'
                          : `${comparison.previousOverallScore}/100`}
                      </dd>
                    </div>
                    <div>
                      <dt>Previous audit</dt>
                      <dd>
                        <SmallLink
                          href={`/workspace/website-audits/${comparison.previousAuditId}`}
                        >
                          {formatDateTime(
                            comparison.previousCompletedAt,
                            timezone,
                          )}
                        </SmallLink>
                      </dd>
                    </div>
                  </MetaGrid>
                </Stack>
              ) : (
                <Hint>
                  No earlier completed audit exists for this domain, so there is
                  nothing to compare against yet.
                </Hint>
              )}
            </Card>
          </TwoCol>

          <Notice $tone="info">
            <span>
              <strong>How to read this score.</strong>{' '}
              {audit.scoringMethod ||
                'The score is a heuristic penalty model applied to findings. It is not a Lighthouse, PageSpeed Insights or Core Web Vitals measurement.'}
            </span>
          </Notice>
        </>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Findings</CardTitle>
            <CardText>
              {findings.length} finding(s). Each records what was observed, why
              it matters, the evidence and how to fix it.
            </CardText>
          </div>
          <Actions>
            <Select
              aria-label="Filter findings by severity"
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              style={{ minWidth: 150 }}
            >
              <option value="">All severities</option>
              {SEVERITY_ORDER.map((key) => (
                <option key={key} value={key}>
                  {metaFor(SEVERITY_META, key).label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter findings by category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              style={{ minWidth: 170 }}
            >
              <option value="">All categories</option>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Actions>
        </CardHead>

        {sortedFindings.length === 0 ? (
          <EmptyState>
            <FileSearch size={17} aria-hidden="true" />
            <div>
              <h3>
                {findings.length === 0
                  ? 'No findings recorded'
                  : 'No findings match the filters'}
              </h3>
              <p>
                {findings.length === 0
                  ? 'Findings are stored when an audit completes or is cancelled after collecting data.'
                  : 'Clear a filter to see the remaining findings.'}
              </p>
            </div>
          </EmptyState>
        ) : (
          <Stack $gap={12}>
            {sortedFindings.map((finding) => {
              const severityMeta = metaFor(SEVERITY_META, finding.severity);
              return (
                <div
                  key={finding.id}
                  style={{
                    padding: 14,
                    border: '1px solid #E5EAF1',
                    borderRadius: 10,
                    background: '#FFFFFF',
                  }}
                >
                  <Row>
                    <Badge $tone={severityMeta.tone}>
                      {severityMeta.label}
                    </Badge>
                    <Badge $tone="muted">
                      {categoryLabels[finding.category] || finding.category}
                    </Badge>
                    <strong style={{ fontSize: '0.86rem' }}>
                      {finding.title}
                    </strong>
                  </Row>
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontSize: '0.8rem',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {finding.description}
                  </p>
                  {finding.evidence ? (
                    <>
                      <Subhead style={{ marginTop: 10 }}>Evidence</Subhead>
                      <Pre>{finding.evidence}</Pre>
                    </>
                  ) : null}
                  <Subhead style={{ marginTop: 10 }}>How to fix</Subhead>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: '0.8rem',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {finding.recommendation}
                  </p>
                  {finding.sourcePage ? (
                    <p style={{ margin: '8px 0 0', fontSize: '0.74rem' }}>
                      Source page:{' '}
                      <a
                        href={finding.sourcePage}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {finding.sourcePage}
                      </a>
                    </p>
                  ) : null}
                </div>
              );
            })}
          </Stack>
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Pages scanned</CardTitle>
            <CardText>
              Only pages actually fetched during this audit are listed.
            </CardText>
          </div>
        </CardHead>
        {pages.length === 0 ? (
          <Hint>No pages were stored.</Hint>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>URL</th>
                  <th>HTTP</th>
                  <th>Time</th>
                  <th>HTML size</th>
                  <th>Title</th>
                  <th>H1</th>
                  <th>Images without alt</th>
                  <th>Links</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id}>
                    <td>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {page.url}
                      </a>
                      {page.redirectCount > 0 ? (
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {page.redirectCount} redirect(s)
                          {page.finalUrl ? ` → ${page.finalUrl}` : ''}
                        </div>
                      ) : null}
                    </td>
                    <td>{page.statusCode ?? '—'}</td>
                    <td>{formatMs(page.responseTimeMs)}</td>
                    <td>{formatBytes(page.htmlBytes)}</td>
                    <td>{page.title || '—'}</td>
                    <td>{page.h1Count ?? '—'}</td>
                    <td>{page.imagesMissingAlt ?? '—'}</td>
                    <td>
                      {page.internalLinks ?? 0} internal ·{' '}
                      {page.externalLinks ?? 0} external
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Execution log</CardTitle>
            <CardText>
              Recorded by the worker as it fetched pages and evaluated findings.
            </CardText>
          </div>
          <Globe2 size={16} aria-hidden="true" />
        </CardHead>
        {logs.length === 0 ? (
          <Hint>No log entries were recorded.</Hint>
        ) : (
          <LogList>
            {logs.map((log) => (
              <li key={log.id}>
                <time>{formatDateTime(log.createdAt, timezone)}</time>
                <em data-level={log.level}>{log.level}</em>
                <p>{log.message}</p>
              </li>
            ))}
          </LogList>
        )}
      </Card>

      <Hint>
        This audit did not run PageSpeed Insights, Lighthouse or a Core Web
        Vitals measurement. Performance notes are response-time and page-size
        signals observed by this crawler only.
      </Hint>
    </Page>
  );
}
