'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, CircleAlert } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  CheckLabel,
  ErrorText,
  Field,
  Grid,
  Hint,
  Input,
  Label,
  Notice,
  Page,
  Select,
} from '@/components/workspace/ai/primitives';
import { Header, Eyebrow, Title, Lead } from '@/components/workspace/ai/primitives';

export default function ProposalCreateForm({
  opportunities,
  owners,
  initialOpportunityId = '',
}) {
  const router = useRouter();
  const initial = opportunities.find((entry) => entry.id === initialOpportunityId);
  const [opportunityId, setOpportunityId] = useState(initialOpportunityId || '');
  const [title, setTitle] = useState(initial ? `${initial.title} proposal` : '');
  const [validityDate, setValidityDate] = useState('');
  const [salesOwnerUserId, setSalesOwnerUserId] = useState(initial?.ownerUserId || '');
  const [prefill, setPrefill] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const selected = opportunities.find((entry) => entry.id === opportunityId);

  function changeOpportunity(value) {
    setOpportunityId(value);
    const next = opportunities.find((entry) => entry.id === value);
    if (next && !title) setTitle(`${next.title} proposal`);
    if (next) setSalesOwnerUserId(next.ownerUserId || '');
  }

  async function submit(event) {
    event.preventDefault();
    setFailure(null);
    if (!opportunityId) {
      setFailure('Choose the opportunity this proposal belongs to.');
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest('/api/workforce/proposals', {
        method: 'POST',
        body: {
          opportunityId,
          title: title.trim() || undefined,
          prefill,
          salesOwnerUserId: salesOwnerUserId || null,
          validityDate: validityDate
            ? new Date(`${validityDate}T00:00:00.000Z`).toISOString()
            : null,
        },
      });
      router.push(`/workspace/proposals/${result.proposal.id}`);
      router.refresh();
    } catch (error) {
      setFailure(error.message);
      setBusy(false);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>New proposal</Eyebrow>
        <Title>Start a proposal draft</Title>
        <Lead>
          Choose an opportunity. Confirmed service requirements and approved
          discovery prefill the first draft. Catalogue prices are never copied
          automatically, so every price starts at zero for a human to set.
        </Lead>
      </Header>

      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          {failure}
        </Notice>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Proposal details</CardTitle>
            <CardText>
              The reference number and first version are generated when you
              create the draft.
            </CardText>
          </div>
        </CardHead>

        <form onSubmit={submit} style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
          <Field>
            <Label>Opportunity</Label>
            <Select
              value={opportunityId}
              onChange={(event) => changeOpportunity(event.target.value)}
              required
            >
              <option value="">Choose an opportunity</option>
              {opportunities.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} — {entry.companyName}
                </option>
              ))}
            </Select>
            {selected ? (
              <Hint>
                {selected.contactName || 'No contact'} · stage {selected.stage} ·{' '}
                {selected.currency || 'INR'}
              </Hint>
            ) : null}
          </Field>

          <Grid $cols={2}>
            <Field>
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder="Proposal title"
              />
            </Field>
            <Field>
              <Label>Valid until</Label>
              <Input
                type="date"
                value={validityDate}
                onChange={(event) => setValidityDate(event.target.value)}
              />
              <Hint>Defaults to 30 days when left blank.</Hint>
            </Field>
          </Grid>

          <Field>
            <Label>Sales owner</Label>
            <Select
              value={salesOwnerUserId}
              onChange={(event) => setSalesOwnerUserId(event.target.value)}
            >
              <option value="">Unassigned</option>
              {owners.map((owner) => (
                <option key={owner.userId} value={owner.userId}>
                  {owner.name || owner.email}
                </option>
              ))}
            </Select>
          </Field>

          <CheckLabel>
            <input
              type="checkbox"
              checked={prefill}
              onChange={(event) => setPrefill(event.target.checked)}
            />
            Start from approved discovery and confirmed requirements
          </CheckLabel>

          <Actions>
            <Button type="submit" $variant="primary" disabled={busy}>
              <BadgeCheck size={15} />
              {busy ? 'Creating…' : 'Create draft'}
            </Button>
            <Button
              type="button"
              $variant="ghost"
              onClick={() => router.push('/workspace/proposals')}
              disabled={busy}
            >
              Cancel
            </Button>
          </Actions>
        </form>
      </Card>

      <ErrorText>
        Creating a proposal records an audit event. It does not change the
        opportunity stage or send anything to the client.
      </ErrorText>
    </Page>
  );
}
