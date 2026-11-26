'use client';

import { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
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
  Select,
  Stack,
  Textarea,
} from '@/components/workspace/ai/primitives';
import { formatValue } from '@/components/workspace/phase2c/meta';

export default function ConversionForm({
  leadId,
  proposals = [],
  currency = 'INR',
  onDone,
}) {
  const [createProject, setCreateProject] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setFailure(null);
    setBusy(true);
    try {
      const result = await apiRequest(
        `/api/workforce/leads/${leadId}/conversion`,
        {
          method: 'POST',
          body: {
            createProject,
            projectName: projectName.trim() || null,
            proposalId: proposalId || null,
            clientNotes: clientNotes.trim() || null,
          },
        },
      );
      onDone?.(result);
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

        <CheckLabel>
          <input
            type="checkbox"
            checked={createProject}
            onChange={(event) => setCreateProject(event.target.checked)}
            disabled={busy}
          />
          Create a delivery project alongside the client
        </CheckLabel>

        {createProject ? (
          <Grid $cols={2}>
            <Field>
              <Label htmlFor="conversion-project-name">Project name</Label>
              <Input
                id="conversion-project-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                maxLength={200}
                disabled={busy}
                placeholder="Optional — defaults to the company name"
              />
            </Field>
            <Field>
              <Label htmlFor="conversion-proposal">Accepted proposal</Label>
              <Select
                id="conversion-proposal"
                value={proposalId}
                onChange={(event) => setProposalId(event.target.value)}
                disabled={busy}
              >
                <option value="">No accepted proposal</option>
                {proposals.map((proposal) => (
                  <option key={proposal.id} value={proposal.id}>
                    {proposal.reference} · {proposal.title} ·{' '}
                    {formatValue(proposal.grandTotalCents / 100, proposal.currency)}
                  </option>
                ))}
              </Select>
              <Hint>
                With a proposal the project uses its accepted value. Without one,
                the project starts at zero and keeps the lead&apos;s reported
                amounts as unverified figures.
              </Hint>
            </Field>
          </Grid>
        ) : null}

        <Field>
          <Label htmlFor="conversion-notes">Client notes</Label>
          <Textarea
            id="conversion-notes"
            value={clientNotes}
            onChange={(event) => setClientNotes(event.target.value)}
            maxLength={2_000}
            disabled={busy}
            placeholder="Handover context for the delivery team (optional)"
          />
        </Field>

        <Hint>
          Conversion is one-way and recorded in the lead timeline. The lead stays
          intact and linked to the new client.
        </Hint>

        <Actions>
          <Button type="submit" $variant="primary" disabled={busy}>
            {busy ? (
              <Loader2 size={13} className="spin" />
            ) : (
              <UserPlus size={13} />
            )}
            Convert to client
          </Button>
        </Actions>
      </Stack>
    </form>
  );
}
