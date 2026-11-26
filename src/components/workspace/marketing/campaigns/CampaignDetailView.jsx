'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Loader2 } from 'lucide-react';
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
  Lead,
  Notice,
  Page,
  Select,
  Stack,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import { MetaGrid, SmallButton } from '@/components/workspace/phase2c/ui';
import { apiRequest } from '@/lib/ai/client';
import { formatDateTime } from '@/lib/ai/format';
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_TRANSITIONS } from '@/lib/marketing/constants';
import MarketingNav from '../MarketingNav';
import { CAMPAIGN_STATUS_META, formatMoney, metaFor } from '../meta';

const APPROVAL_LABELS = {
  not_requested: 'Not requested',
  pending: 'Pending',
  approved: 'Approved by client',
  rejected: 'Rejected by client',
};

export default function CampaignDetailView({ campaign, canManage, timezone }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [approval, setApproval] = useState(campaign.clientApprovalStatus);
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);

  const status = metaFor(CAMPAIGN_STATUS_META, campaign.status);
  const nextStatuses = CAMPAIGN_TRANSITIONS[campaign.status] || [];

  async function changeStatus(target) {
    setBusy(target);
    setFailure(null);
    setNotice(null);
    try {
      await apiRequest(
        `/api/workforce/marketing/campaigns/${campaign.id}/status`,
        {
          method: 'POST',
          body: {
            status: target,
            note: note.trim() || null,
            expectedUpdatedAt: campaign.updatedAt,
          },
        },
      );
      setNote('');
      setNotice(`Campaign moved to ${CAMPAIGN_STATUS_LABELS[target]}.`);
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function saveApproval() {
    setBusy('approval');
    setFailure(null);
    setNotice(null);
    try {
      await apiRequest(
        `/api/workforce/marketing/campaigns/${campaign.id}/approval`,
        {
          method: 'POST',
          body: { clientApprovalStatus: approval, note: note.trim() || null },
        },
      );
      setNotice('Client approval status recorded.');
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
          <Link href="/workspace/marketing/campaigns">Campaigns</Link> ·{' '}
          {campaign.clientReference || campaign.clientName}
        </Eyebrow>
        <Title>{campaign.name}</Title>
        <Lead>
          {campaign.clientName}
          {campaign.projectName ? ` · ${campaign.projectName}` : ''} ·{' '}
          {campaign.channel.replaceAll('_', ' ')}
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
          This is a planning record. Approved and scheduled campaigns are not
          live ads, and approving does not spend the estimated budget.
        </span>
      </Notice>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Campaign record</CardTitle>
            <CardText>
              Updated {formatDateTime(campaign.updatedAt, timezone)}
            </CardText>
          </div>
          <Badge $tone={status.tone}>{status.label}</Badge>
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Objective</dt>
            <dd>{campaign.objective || '—'}</dd>
          </div>
          <div>
            <dt>Target audience</dt>
            <dd>{campaign.targetAudience || '—'}</dd>
          </div>
          <div>
            <dt>Geography</dt>
            <dd>{campaign.targetGeography || '—'}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{campaign.ownerName || 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Start</dt>
            <dd>
              {campaign.startDate
                ? new Date(campaign.startDate).toISOString().slice(0, 10)
                : '—'}
            </dd>
          </div>
          <div>
            <dt>End</dt>
            <dd>
              {campaign.endDate
                ? new Date(campaign.endDate).toISOString().slice(0, 10)
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Budget estimate</dt>
            <dd>{formatMoney(campaign.budgetEstimate, campaign.currency)}</dd>
          </div>
          <div>
            <dt>Success metrics</dt>
            <dd>{campaign.successMetrics || '—'}</dd>
          </div>
          <div>
            <dt>Client approval</dt>
            <dd>
              <Badge
                $tone={
                  campaign.clientApprovalStatus === 'approved'
                    ? 'success'
                    : campaign.clientApprovalStatus === 'rejected'
                      ? 'danger'
                      : 'muted'
                }
              >
                {APPROVAL_LABELS[campaign.clientApprovalStatus] ||
                  campaign.clientApprovalStatus}
              </Badge>
            </dd>
          </div>
        </MetaGrid>
        {campaign.objectiveDescription ? (
          <Stack $gap={6}>
            <Hint>Objective details</Hint>
            <p style={{ margin: 0, fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>
              {campaign.objectiveDescription}
            </p>
          </Stack>
        ) : null}
        {campaign.notes ? (
          <Stack $gap={6}>
            <Hint>Notes</Hint>
            <p style={{ margin: 0, fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>
              {campaign.notes}
            </p>
          </Stack>
        ) : null}
      </Card>

      {canManage ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Workflow</CardTitle>
              <CardText>
                Only the next permitted states are offered. Every change is
                audited.
              </CardText>
            </div>
          </CardHead>
          <Stack $gap={12}>
            <Textarea
              aria-label="Transition note"
              placeholder="Optional note for this change"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <Actions>
              {nextStatuses.length === 0 ? (
                <Hint>This campaign has reached a closed state.</Hint>
              ) : (
                nextStatuses.map((target) => (
                  <SmallButton
                    key={target}
                    type="button"
                    $variant={target === 'cancelled' ? 'danger' : 'default'}
                    onClick={() => changeStatus(target)}
                    disabled={busy === target}
                  >
                    {busy === target ? (
                      <Loader2 size={13} className="spin" />
                    ) : null}
                    Move to {CAMPAIGN_STATUS_LABELS[target]}
                  </SmallButton>
                ))
              )}
            </Actions>
          </Stack>
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Client approval</CardTitle>
              <CardText>
                Record what the client decided. This is a note, not a message
                sent to them.
              </CardText>
            </div>
          </CardHead>
          <Stack $gap={10}>
            <Select
              aria-label="Client approval status"
              value={approval}
              onChange={(event) => setApproval(event.target.value)}
            >
              {Object.entries(APPROVAL_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
            <Actions>
              <Button
                type="button"
                onClick={saveApproval}
                disabled={busy === 'approval'}
              >
                {busy === 'approval' ? (
                  <Loader2 size={14} className="spin" />
                ) : null}
                Save approval status
              </Button>
            </Actions>
          </Stack>
        </Card>
      ) : null}

      <Hint>
        Budget figures are planning estimates stored in minor units. They are not
        invoices, payments or ad spend.
      </Hint>
    </Page>
  );
}
