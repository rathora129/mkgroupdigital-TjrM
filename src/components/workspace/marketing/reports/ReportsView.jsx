'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormik } from 'formik';
import { useRouter } from 'next/navigation';
import { BarChart3, CircleAlert, Loader2 } from 'lucide-react';
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
  Table,
  TableWrap,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import { ListPager, MetaGrid } from '@/components/workspace/phase2c/ui';
import { apiRequest } from '@/lib/ai/client';
import { formatDateTime } from '@/lib/ai/format';
import {
  METRIC_KEYS,
  METRIC_LABELS,
  METRIC_SOURCES,
  METRIC_SOURCE_LABELS,
} from '@/lib/marketing/constants';
import MarketingNav from '../MarketingNav';
import { METRIC_SOURCE_TONES, dateInputValue, toIsoDate } from '../meta';

const KEYS = ['clientId', 'search', 'page'];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text
    ? `/workspace/marketing/reports?${text}`
    : '/workspace/marketing/reports';
}

function MetricForm({ clients, onDone }) {
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);

  const formik = useFormik({
    initialValues: {
      clientId: '',
      metricKey: METRIC_KEYS[0],
      value: '',
      source: 'manual',
      periodStart: '',
      periodEnd: '',
      notes: '',
    },
    onSubmit: async (values, helpers) => {
      setFailure(null);
      setNotice(null);
      try {
        await apiRequest('/api/workforce/marketing/metrics', {
          method: 'POST',
          body: {
            clientId: values.clientId,
            metricKey: values.metricKey,
            value: values.value === '' ? null : Number(values.value),
            source: values.source,
            periodStart: toIsoDate(values.periodStart),
            periodEnd: toIsoDate(values.periodEnd),
            notes: values.notes || null,
          },
        });
        helpers.resetForm();
        setNotice('Metric recorded.');
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
        {notice ? <Notice $tone="success">{notice}</Notice> : null}
        {failure ? (
          <Notice $tone="danger">
            <CircleAlert size={15} />
            {failure}
          </Notice>
        ) : null}
        <Grid $cols={2}>
          <Field>
            <Label>Client</Label>
            <Select name="clientId" {...formik.getFieldProps('clientId')}>
              <option value="">Choose a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Metric</Label>
            <Select name="metricKey" {...formik.getFieldProps('metricKey')}>
              {METRIC_KEYS.map((key) => (
                <option key={key} value={key}>
                  {METRIC_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Value</Label>
            <Input
              name="value"
              type="number"
              min="0"
              step="any"
              {...formik.getFieldProps('value')}
            />
          </Field>
          <Field>
            <Label>Source</Label>
            <Select name="source" {...formik.getFieldProps('source')}>
              {METRIC_SOURCES.map((key) => (
                <option key={key} value={key}>
                  {METRIC_SOURCE_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Period start</Label>
            <Input
              name="periodStart"
              type="date"
              {...formik.getFieldProps('periodStart')}
            />
          </Field>
          <Field>
            <Label>Period end</Label>
            <Input
              name="periodEnd"
              type="date"
              {...formik.getFieldProps('periodEnd')}
            />
          </Field>
          <Field style={{ gridColumn: '1 / -1' }}>
            <Label>Notes (optional)</Label>
            <Textarea
              name="notes"
              rows={2}
              placeholder="How this figure was obtained"
              {...formik.getFieldProps('notes')}
            />
          </Field>
        </Grid>
        <Actions>
          <Button
            type="submit"
            disabled={
              formik.isSubmitting ||
              !formik.values.clientId ||
              formik.values.value === '' ||
              !formik.values.periodStart ||
              !formik.values.periodEnd
            }
          >
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : null}
            Record metric
          </Button>
        </Actions>
      </Stack>
    </form>
  );
}

function ReportForm({ clients, onDone }) {
  const [failure, setFailure] = useState(null);

  const formik = useFormik({
    initialValues: {
      clientId: '',
      title: '',
      periodStart: '',
      periodEnd: '',
    },
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest('/api/workforce/marketing/reports', {
          method: 'POST',
          body: {
            clientId: values.clientId,
            title: values.title,
            periodStart: toIsoDate(values.periodStart),
            periodEnd: toIsoDate(values.periodEnd),
          },
        });
        onDone(result);
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
            <Label>Client</Label>
            <Select name="clientId" {...formik.getFieldProps('clientId')}>
              <option value="">Choose a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Title</Label>
            <Input
              name="title"
              placeholder="e.g. October performance"
              {...formik.getFieldProps('title')}
            />
          </Field>
          <Field>
            <Label>Period start</Label>
            <Input
              name="periodStart"
              type="date"
              {...formik.getFieldProps('periodStart')}
            />
          </Field>
          <Field>
            <Label>Period end</Label>
            <Input
              name="periodEnd"
              type="date"
              {...formik.getFieldProps('periodEnd')}
            />
          </Field>
        </Grid>
        <Actions>
          <Button
            type="submit"
            disabled={
              formik.isSubmitting ||
              !formik.values.clientId ||
              !formik.values.title.trim() ||
              !formik.values.periodStart ||
              !formik.values.periodEnd
            }
          >
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : null}
            Create report
          </Button>
        </Actions>
      </Stack>
    </form>
  );
}

export default function ReportsView({
  metrics,
  metricsOverview,
  reports,
  query,
  clients,
  canManage,
  canReport,
  timezone,
}) {
  const router = useRouter();

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    router.push(
      listHref({
        clientId: String(data.get('clientId') || '') || undefined,
        search: String(data.get('search') || '').trim() || undefined,
      }),
    );
  }

  const sourceCounts = metricsOverview?.sourceCounts || {};

  return (
    <Page>
      <Header>
        <Eyebrow>Performance &amp; reporting</Eyebrow>
        <Title>Marketing metrics and reports</Title>
        <Lead>
          Every figure keeps its source: manually entered, imported, calculated or
          an AI estimate. Nothing is invented, no ad spend is made, and AI
          narrative is only added after review.
        </Lead>
      </Header>
      <MarketingNav />

      <Notice $tone="info">
        <span>
          Estimates are labelled and are not verified analytics. A report
          summarises recorded data plus recorded content output and executed
          website changes — it never claims an external system was touched.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Metrics recorded</StatLabel>
          <StatValue>{metricsOverview?.total ?? metrics.total}</StatValue>
          <StatNote>All sources</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Reports</StatLabel>
          <StatValue>{reports.total}</StatValue>
          <StatNote>Stored snapshots</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Calculated</StatLabel>
          <StatValue>{sourceCounts.calculated || 0}</StatValue>
          <StatNote>Derived from recorded values</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>AI estimates</StatLabel>
          <StatValue>{sourceCounts.ai_estimate || 0}</StatValue>
          <StatNote>Not verified analytics</StatNote>
        </StatCard>
      </StatGrid>

      {canManage ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Record a metric</CardTitle>
              <CardText>
                Metrics describe past periods only. Recording a metric never
                triggers spend or an external call.
              </CardText>
            </div>
          </CardHead>
          <MetricForm clients={clients} onDone={() => router.refresh()} />
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Metrics</CardTitle>
            <CardText>
              {metrics.total} recorded metric(s). Showing the most recent{' '}
              {metrics.items.length}.
            </CardText>
          </div>
        </CardHead>
        {metrics.items.length === 0 ? (
          <EmptyState>
            <BarChart3 size={17} aria-hidden="true" />
            <div>
              <h3>No metrics recorded</h3>
              <p>Record a figure to start building a report.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Client</th>
                  <th>Value</th>
                  <th>Source</th>
                  <th>Period</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {metrics.items.map((metric) => (
                  <tr key={metric.id}>
                    <td>{metric.metricLabel}</td>
                    <td>
                      {metric.clientName}
                      {metric.campaignName ? (
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {metric.campaignName}
                        </div>
                      ) : null}
                    </td>
                    <td>{metric.value}</td>
                    <td>
                      <Badge $tone={METRIC_SOURCE_TONES[metric.source] || 'muted'}>
                        {metric.sourceLabel}
                      </Badge>
                    </td>
                    <td>
                      {dateInputValue(metric.periodStart)} –{' '}
                      {dateInputValue(metric.periodEnd)}
                    </td>
                    <td>{metric.recordedByName || 'Unknown'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {canReport ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Create a report</CardTitle>
              <CardText>
                The report snapshots recorded metrics for the period. AI narrative
                is requested separately and only imported after review.
              </CardText>
            </div>
          </CardHead>
          <ReportForm
            clients={clients}
            onDone={(result) => {
              const id = result?.report?.report?.id || result?.report?.id;
              if (id) {
                router.push(`/workspace/marketing/reports/${id}`);
              } else {
                router.refresh();
              }
            }}
          />
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Reports</CardTitle>
            <CardText>
              {reports.total} report(s). Showing page {reports.page} of{' '}
              {reports.pages}.
            </CardText>
          </div>
        </CardHead>

        <form
          onSubmit={submitFilters}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}
        >
          <Field style={{ minWidth: 180 }}>
            <Label>Search</Label>
            <Input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Report title or client"
            />
          </Field>
          <Field style={{ minWidth: 180 }}>
            <Label>Client</Label>
            <Select name="clientId" defaultValue={query.clientId || ''}>
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
          </Field>
          <Actions style={{ alignItems: 'flex-end' }}>
            <Button type="submit">Apply</Button>
            <Button
              type="button"
              $variant="ghost"
              onClick={() => router.push('/workspace/marketing/reports')}
            >
              Reset
            </Button>
          </Actions>
        </form>

        {reports.items.length === 0 ? (
          <EmptyState>
            <BarChart3 size={17} aria-hidden="true" />
            <div>
              <h3>No reports yet</h3>
              <p>Create a report from recorded metrics.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Client</th>
                  <th>Period</th>
                  <th>Sources</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {reports.items.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <Link href={`/workspace/marketing/reports/${report.id}`}>
                        {report.title}
                      </Link>
                      {report.projectName ? (
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {report.projectName}
                        </div>
                      ) : null}
                    </td>
                    <td>{report.clientName}</td>
                    <td>
                      {dateInputValue(report.periodStart)} –{' '}
                      {dateInputValue(report.periodEnd)}
                    </td>
                    <td>
                      {(report.dataSources || []).map((source) => (
                        <Badge key={source} $tone="muted">
                          {source}
                        </Badge>
                      ))}
                    </td>
                    <td>{formatDateTime(report.createdAt, timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}

        <ListPager
          page={reports.page}
          pages={reports.pages}
          total={reports.total}
          pageSize={reports.pageSize}
          hrefFor={(target) => listHref(query, { page: target })}
        />
      </Card>

      <MetaGrid>
        <div>
          <dt>Note</dt>
          <dd>
            Reports are internal. No report is emailed, published or sent to a
            client automatically.
          </dd>
        </div>
      </MetaGrid>
    </Page>
  );
}
