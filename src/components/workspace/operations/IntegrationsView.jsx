'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plug, RefreshCw, ShieldCheck } from 'lucide-react';
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
  Lead,
  Notice,
  Page,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDateTime } from '@/lib/ai/format';
import { apiRequest } from '@/lib/ai/client';
import {
  CAPABILITY_LABELS,
  INTEGRATION_KIND_LABELS,
  INTEGRATION_STATUS_TONES,
} from '@/lib/integrations/constants';
import OperationsNav from './OperationsNav';

function Group({ kind, rows, canManage, busy, onAction }) {
  return (
    <Card>
      <CardHead>
        <div>
          <CardTitle>{INTEGRATION_KIND_LABELS[kind] || kind}</CardTitle>
          <CardText>
            {rows.filter((row) => row.status === 'configured').length} of{' '}
            {rows.length} configured in the environment.
          </CardText>
        </div>
      </CardHead>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Status</th>
              <th>Capabilities</th>
              <th>Last sync</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.kind}:${row.provider}`}>
                <td>
                  <strong>{row.name}</strong>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    {row.provider} · {row.connectionType}
                  </div>
                  {row.requiredEnvKeys.length ? (
                    <div style={{ fontSize: '0.72rem', opacity: 0.6 }}>
                      Env: {row.requiredEnvKeys.join(', ')}
                    </div>
                  ) : null}
                </td>
                <td>
                  <Badge $tone={INTEGRATION_STATUS_TONES[row.status]}>
                    {row.statusLabel}
                  </Badge>
                  {row.lastErrorMessage ? (
                    <div style={{ fontSize: '0.72rem', color: 'inherit', opacity: 0.7 }}>
                      {row.lastErrorMessage}
                    </div>
                  ) : null}
                </td>
                <td style={{ fontSize: '0.75rem' }}>
                  {row.capabilities
                    .map((item) => CAPABILITY_LABELS[item] || item)
                    .join(', ') || '—'}
                </td>
                <td style={{ fontSize: '0.75rem' }}>
                  {row.lastSyncAt ? formatDateTime(row.lastSyncAt) : '—'}
                </td>
                <td>
                  <Actions>
                    {!row.id && canManage ? (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => onAction('register', row)}
                      >
                        Register
                      </Button>
                    ) : null}
                    {row.id && canManage && row.configured && row.status !== 'configured' ? (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => onAction('connect', row)}
                      >
                        Connect
                      </Button>
                    ) : null}
                    {row.id && canManage && row.status !== 'disconnected' ? (
                      <Button
                        type="button"
                        $variant="ghost"
                        disabled={busy}
                        onClick={() => onAction('disconnect', row)}
                      >
                        Disconnect
                      </Button>
                    ) : null}
                  </Actions>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

export default function IntegrationsView({ overview, canManage, timezone }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const rows = overview.integrations || [];
  const grouped = rows.reduce((map, row) => {
    (map[row.kind] ||= []).push(row);
    return map;
  }, {});

  async function handleAction(action, row) {
    setBusy(true);
    setError(null);
    try {
      if (action === 'register') {
        await apiRequest('/api/workforce/integrations', {
          method: 'POST',
          body: { kind: row.kind, provider: row.provider, name: row.name },
        });
      } else if (action === 'connect') {
        await apiRequest(`/api/workforce/integrations/${row.id}/connect`, {
          method: 'POST',
        });
      } else if (action === 'disconnect') {
        await apiRequest(`/api/workforce/integrations/${row.id}/disconnect`, {
          method: 'POST',
        });
      }
      router.refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Phase 2H · integration readiness</Eyebrow>
        <Title>Integrations</Title>
        <Lead>
          Every adapter is contract-only in this phase. Credentials are read
          from the server environment by name, never stored in the database or
          returned to this page. An integration is only “configured” when the
          environment already supplies every required variable name.
        </Lead>
      </Header>
      <OperationsNav />

      {error ? <Notice $tone="danger">{error}</Notice> : null}

      <StatGrid>
        <StatCard>
          <StatLabel>Configured</StatLabel>
          <StatValue>{overview.summary.configured}</StatValue>
          <StatNote>Credential names present in the environment</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Not configured</StatLabel>
          <StatValue>{overview.summary.not_configured}</StatValue>
          <StatNote>No credential names found; never shown as connected</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Errors</StatLabel>
          <StatValue>{overview.summary.error}</StatValue>
          <StatNote>Last sync failed and needs review</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Webhook secret</StatLabel>
          <StatValue>{overview.webhookSecretConfigured ? 'Set' : 'Missing'}</StatValue>
          <StatNote>Inbound events stay rejected until it is set</StatNote>
        </StatCard>
      </StatGrid>

      <Notice $tone="muted">
        Live provider calls, publishing, advertising and customer messaging are
        disabled. The only executable path is the labelled mock adapter used by
        execution requests and automation.
      </Notice>

      <Grid>
        {Object.entries(grouped).map(([kind, kindRows]) => (
          <Group
            key={kind}
            kind={kind}
            rows={kindRows}
            canManage={canManage}
            busy={busy}
            onAction={handleAction}
          />
        ))}
      </Grid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Recent sync events</CardTitle>
            <CardText>
              Recorded by the existing worker. Payload summaries only; no
              credential value is stored.
            </CardText>
          </div>
          <RefreshCw size={16} aria-hidden="true" />
        </CardHead>
        {overview.recentEvents.length === 0 ? (
          <Hint>No sync events have been recorded yet.</Hint>
        ) : (
          <ListBlock rows={overview.recentEvents} timezone={timezone} />
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Failed sync events</CardTitle>
            <CardText>Failures stay visible until they are resolved.</CardText>
          </div>
          <ShieldCheck size={16} aria-hidden="true" />
        </CardHead>
        {overview.failedEvents.length === 0 ? (
          <Hint>No failed sync events.</Hint>
        ) : (
          <ListBlock rows={overview.failedEvents} timezone={timezone} failed />
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Inbound webhook events</CardTitle>
            <CardText>
              Only signature-verified events are accepted. A duplicate
              idempotency key is stored once.
            </CardText>
          </div>
          <Plug size={16} aria-hidden="true" />
        </CardHead>
        {overview.recentWebhooks.length === 0 ? (
          <Hint>No webhook events received yet.</Hint>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Signature</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentWebhooks.map((event) => (
                  <tr key={event.id}>
                    <td>{event.provider}</td>
                    <td>{event.eventType}</td>
                    <td>{event.status}</td>
                    <td>{event.signatureValid ? 'Valid' : 'Invalid'}</td>
                    <td>{formatDateTime(event.receivedAt, timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </Page>
  );
}

function ListBlock({ rows, timezone, failed = false }) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <th>When</th>
            <th>Source</th>
            <th>Event</th>
            <th>Status</th>
            {failed ? <th>Error</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDateTime(row.createdAt, timezone)}</td>
              <td>{row.source}</td>
              <td>{row.eventType}</td>
              <td>{row.status}</td>
              {failed ? <td>{row.errorMessage || '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
