'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Button,
  CheckLabel,
  Field,
  Grid,
  Hint,
  Input,
  Label,
  Notice,
  Stack,
} from '@/components/workspace/ai/primitives';

function toMajor(value) {
  if (value == null) return '';
  return String(Number(value) / 100);
}

function toCents(value) {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return undefined;
  return Math.round(amount * 100);
}

export default function ReportedAmountsForm({ lead, onDone }) {
  const [received, setReceived] = useState(toMajor(lead.reportedAmountReceivedCents));
  const [outstanding, setOutstanding] = useState(
    toMajor(lead.reportedOutstandingCents),
  );
  const [projectCost, setProjectCost] = useState(
    toMajor(lead.reportedProjectCostCents),
  );
  const [verified, setVerified] = useState(Boolean(lead.reportedAmountVerified));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setFailure(null);

    const payload = {
      reportedAmountReceivedCents: toCents(received),
      reportedOutstandingCents: toCents(outstanding),
      reportedProjectCostCents: toCents(projectCost),
      reportedAmountVerified: verified,
    };
    if (Object.values(payload).some((value) => value === undefined || value < 0)) {
      setFailure('Enter a whole non-negative amount, or leave the field blank.');
      return;
    }

    setBusy(true);
    try {
      await apiRequest(`/api/workforce/leads/${lead.id}/reported-amounts`, {
        method: 'PATCH',
        body: payload,
      });
      onDone?.();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack $gap={12}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}
        <Grid $cols={3}>
          <Field>
            <Label htmlFor="reported-received">Amount received</Label>
            <Input
              id="reported-received"
              type="number"
              min="0"
              step="0.01"
              value={received}
              onChange={(event) => setReceived(event.target.value)}
              disabled={busy}
              placeholder="0.00"
            />
          </Field>
          <Field>
            <Label htmlFor="reported-outstanding">Outstanding</Label>
            <Input
              id="reported-outstanding"
              type="number"
              min="0"
              step="0.01"
              value={outstanding}
              onChange={(event) => setOutstanding(event.target.value)}
              disabled={busy}
              placeholder="0.00"
            />
          </Field>
          <Field>
            <Label htmlFor="reported-cost">Project cost</Label>
            <Input
              id="reported-cost"
              type="number"
              min="0"
              step="0.01"
              value={projectCost}
              onChange={(event) => setProjectCost(event.target.value)}
              disabled={busy}
              placeholder="0.00"
            />
          </Field>
        </Grid>
        <CheckLabel>
          <input
            type="checkbox"
            checked={verified}
            onChange={(event) => setVerified(event.target.checked)}
            disabled={busy}
          />
          Mark these as verified against supporting records
        </CheckLabel>
        <Hint>
          Amounts are stored in {lead.currency || 'INR'}. Leaving a field blank
          clears it. Verification is a human attestation; it never creates a
          payment or an invoice.
        </Hint>
        <Actions>
          <Button type="submit" $variant="primary" disabled={busy}>
            {busy ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
            Save reported amounts
          </Button>
        </Actions>
      </Stack>
    </form>
  );
}
