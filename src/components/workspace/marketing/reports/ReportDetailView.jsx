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
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import { MetaGrid } from '@/components/workspace/phase2c/ui';
import { apiRequest } from '@/lib/ai/client';
import { formatDateTime } from '@/lib/ai/format';
import { METRIC_LABELS } from '@/lib/marketing/constants';
import MarketingNav from '../MarketingNav';
import { METRIC_SOURCE_TONES, dateInputValue } from '../meta';

export default function ReportDetailView({ detail, canReport, timezone }) {
  const router = useRouter();
  const { report, clientName, projectName, createdByName } = detail;
  const snapshot = report.dataSnapshot || {};
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [runId, setRunId] = useState('');

  const computedRows = [
    ...Object.entries(snapshot.sums || {}).map(([key, value]) => ({
      key,
      value,
      kind: 'Recorded total',
    })),
    ...Object.entries(snapshot.averages || {}).map(([key, value]) => ({
      key: `${key}-avg`,
      label: `${METRIC_LABELS[key] || key} (average)`,
      value,
      kind: 'Average',
    })),
    ...Object.entries(snapshot.derived || {}).map(([key, value]) => ({
      key: `derived-${key}`,
      label: METRIC_LABELS[key] || key,
      value,
      kind: 'Calculated',
    })),
  ];

  async function requestNarrative() {
    setBusy('request');
    setFailure(null);
    setNotice(null);
    try {
      const result = await apiRequest(
        `/api/workforce/marketing/reports/${report.id}/narrative`,
        { method: 'POST', body: { action: 'request' } },
      );
      const run = result?.run?.id;
      setNotice(
        run
          ? `${result.message} Run: ${run}`
          : result?.message || 'Narrative request recorded.',
      );
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function importNarrative() {
    setBusy('import');
    setFailure(null);
    setNotice(null);
    try {
      await apiRequest(
        `/api/workforce/marketing/reports/${report.id}/narrative`,
        { method: 'POST', body: { action: 'import', runId } },
      );
      setNotice('AI narrative imported into the report summary.');
      setRunId('');
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
          <Link href="/workspace/marketing/reports">Performance</Link> ·{' '}
          {clientName}
        </Eyebrow>
        <Title>{report.title}</Title>
        <Lead>
          {dateInputValue(report.periodStart)} –{' '}
          {dateInputValue(report.periodEnd)}
          {projectName ? ` · ${projectName}` : ''}
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
          This report is an internal record. No figure is invented, no ad spend is
          made, and nothing is emailed or published.
        </span>
      </Notice>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Report</CardTitle>
            <CardText>
              Created {formatDateTime(report.createdAt, timezone)}
            </CardText>
          </div>
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Client</dt>
            <dd>{clientName}</dd>
          </div>
          <div>
            <dt>Created by</dt>
            <dd>{createdByName || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Data sources</dt>
            <dd>
              {(report.dataSources || []).length === 0
                ? 'None recorded'
                : report.dataSources.join(', ')}
            </dd>
          </div>
          <div>
            <dt>Content output recorded</dt>
            <dd>{snapshot.contentOutputRecorded ?? 0}</dd>
          </div>
          <div>
            <dt>Website changes executed</dt>
            <dd>{snapshot.executedProposals ?? 0}</dd>
          </div>
        </MetaGrid>
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Summary</CardTitle>
            <CardText>
              Data-derived by default. An AI narrative is only stored after a
              completed run is imported.
            </CardText>
          </div>
        </CardHead>
        <Pre>{report.summary || 'No summary recorded.'}</Pre>
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Recorded figures</CardTitle>
            <CardText>
              {(snapshot.metrics || []).length} metric record(s) in this period.
            </CardText>
          </div>
        </CardHead>
        {(snapshot.metrics || []).length === 0 ? (
          <Hint>No metrics were recorded for this period.</Hint>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th>Source</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.metrics.map((metric, index) => (
                  <tr key={`${metric.metricKey}-${index}`}>
                    <td>{metric.label || METRIC_LABELS[metric.metricKey]}</td>
                    <td>{metric.value}</td>
                    <td>
                      <Badge $tone={METRIC_SOURCE_TONES[metric.source] || 'muted'}>
                        {metric.sourceLabel || metric.source}
                      </Badge>
                    </td>
                    <td>
                      {dateInputValue(metric.periodStart)} –{' '}
                      {dateInputValue(metric.periodEnd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {computedRows.length > 0 ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Totals and calculated figures</CardTitle>
              <CardText>
                Calculated values are derived from recorded figures only.
              </CardText>
            </div>
          </CardHead>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Figure</th>
                  <th>Value</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label || METRIC_LABELS[row.key] || row.key}</td>
                    <td>{row.value}</td>
                    <td>
                      <Badge
                        $tone={row.kind === 'Calculated' ? 'warning' : 'muted'}
                      >
                        {row.kind}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      ) : null}

      {canReport ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>AI narrative</CardTitle>
              <CardText>
                Request a narrative from the stored snapshot, then import the
                completed run. The data-derived summary is kept until an import
                succeeds.
              </CardText>
            </div>
          </CardHead>
          <Stack $gap={10}>
            <Actions>
              <Button
                type="button"
                onClick={requestNarrative}
                disabled={Boolean(busy)}
              >
                {busy === 'request' ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Sparkles size={13} />
                )}
                Request AI narrative
              </Button>
            </Actions>
            <Label htmlFor="runId">Import a completed run</Label>
            <Input
              id="runId"
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
              placeholder="Paste the completed AI run identifier"
            />
            <Actions>
              <Button
                type="button"
                onClick={importNarrative}
                disabled={Boolean(busy) || !runId.trim()}
              >
                {busy === 'import' ? (
                  <Loader2 size={14} className="spin" />
                ) : null}
                Import narrative
              </Button>
            </Actions>
          </Stack>
        </Card>
      ) : null}
    </Page>
  );
}
