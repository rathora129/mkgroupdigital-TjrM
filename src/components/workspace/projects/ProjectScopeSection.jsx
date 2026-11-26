'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, ShieldAlert, X } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import { formatDateTime } from '@/lib/ai/format';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  ErrorText,
  Field,
  Input,
  Label,
  Notice,
  Stack,
  Textarea,
} from '@/components/workspace/ai/primitives';
import { Subhead, Timeline, TimelineItem } from '@/components/workspace/phase2c/ui';
import { metaFor, SCOPE_CHANGE_META } from './meta';

const schema = yup.object({
  title: yup
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters.')
    .max(200, 'Title must be 200 characters or fewer.')
    .required('Title is required.'),
  description: yup.string().trim().max(4_000, 'Description is too long.'),
  impactNotes: yup.string().trim().max(4_000, 'Impact notes are too long.'),
});

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function ProjectScopeSection({
  projectId,
  scopeChanges,
  canEdit,
  canManage,
  timezone,
  onChanged,
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [decidingId, setDecidingId] = useState(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const formik = useFormik({
    initialValues: { title: '', description: '', impactNotes: '' },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        await apiRequest(`/api/workforce/projects/${projectId}/scope-changes`, {
          method: 'POST',
          body: {
            title: values.title.trim(),
            description: textOrNull(values.description),
            impactNotes: textOrNull(values.impactNotes),
          },
        });
        helpers.resetForm();
        setShowCreate(false);
        setNotice('Scope change requested.');
        router.refresh();
        onChanged?.();
      } catch (error) {
        if (error.code === 'VALIDATION_FAILED' && error.details) {
          helpers.setErrors(error.details);
        }
        setFailure(error.message);
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  async function decide(scopeChangeId, status) {
    setSaving(true);
    setFailure(null);
    try {
      await apiRequest(
        `/api/workforce/projects/${projectId}/scope-changes/${scopeChangeId}`,
        {
          method: 'PATCH',
          body: {
            status,
            decisionNotes: textOrNull(decisionNotes),
          },
        },
      );
      setDecidingId(null);
      setDecisionNotes('');
      setNotice(`Scope change ${status}.`);
      router.refresh();
      onChanged?.();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHead>
        <div>
          <CardTitle>Scope changes</CardTitle>
          <CardText>
            Change requests keep their own decision history. The accepted
            proposal version and its snapshot are never modified.
          </CardText>
        </div>
        {canEdit ? (
          <Actions>
            <Button
              type="button"
              $variant="primary"
              onClick={() => setShowCreate((current) => !current)}
            >
              <Plus size={14} />
              {showCreate ? 'Close form' : 'Request change'}
            </Button>
          </Actions>
        ) : null}
      </CardHead>

      {failure ? <Notice $tone="danger">{failure}</Notice> : null}
      {notice ? <Notice $tone="success">{notice}</Notice> : null}

      {showCreate && canEdit ? (
        <Card $flat>
          <Subhead>New scope change request</Subhead>
          <form onSubmit={formik.handleSubmit}>
            <Stack $gap={14}>
              <Field>
                <Label htmlFor="scope-title">Title</Label>
                <Input
                  id="scope-title"
                  name="title"
                  value={formik.values.title}
                  onChange={formik.handleChange}
                  disabled={formik.isSubmitting}
                  required
                />
                {formik.errors.title ? (
                  <ErrorText>{formik.errors.title}</ErrorText>
                ) : null}
              </Field>
              <Field>
                <Label htmlFor="scope-description">Requested change</Label>
                <Textarea
                  id="scope-description"
                  name="description"
                  value={formik.values.description}
                  onChange={formik.handleChange}
                  maxLength={4_000}
                  style={{ minHeight: 70 }}
                  disabled={formik.isSubmitting}
                />
              </Field>
              <Field>
                <Label htmlFor="scope-impact">Impact notes</Label>
                <Textarea
                  id="scope-impact"
                  name="impactNotes"
                  value={formik.values.impactNotes}
                  onChange={formik.handleChange}
                  maxLength={4_000}
                  style={{ minHeight: 70 }}
                  placeholder="Effort, timeline, commercial or delivery impact."
                  disabled={formik.isSubmitting}
                />
              </Field>
              <Actions>
                <Button
                  type="submit"
                  $variant="primary"
                  disabled={formik.isSubmitting}
                >
                  {formik.isSubmitting ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <ShieldAlert size={14} />
                  )}
                  Submit request
                </Button>
                <Button
                  type="button"
                  $variant="ghost"
                  onClick={() => setShowCreate(false)}
                  disabled={formik.isSubmitting}
                >
                  <X size={14} />
                  Cancel
                </Button>
              </Actions>
            </Stack>
          </form>
        </Card>
      ) : null}

      {scopeChanges.length === 0 ? (
        <CardText>No scope changes recorded.</CardText>
      ) : (
        <Timeline>
          {scopeChanges.map((entry) => {
            const meta = metaFor(SCOPE_CHANGE_META, entry.status);
            return (
              <TimelineItem
                key={entry.id}
                $tone={
                  entry.status === 'approved'
                    ? 'success'
                    : entry.status === 'rejected'
                      ? 'danger'
                      : 'warning'
                }
              >
                <strong>
                  {entry.title} <Badge $tone={meta.tone}>{meta.label}</Badge>
                </strong>
                {entry.description ? <p>{entry.description}</p> : null}
                {entry.impactNotes ? (
                  <p>
                    <em>Impact:</em> {entry.impactNotes}
                  </p>
                ) : null}
                {entry.decisionNotes ? (
                  <p>
                    <em>Decision:</em> {entry.decisionNotes}
                  </p>
                ) : null}
                <span>
                  Requested {formatDateTime(entry.createdAt, timezone)}
                  {entry.requestedByName ? ` by ${entry.requestedByName}` : ''}
                  {entry.decidedAt
                    ? ` · Decided ${formatDateTime(entry.decidedAt, timezone)}${
                        entry.decidedByName ? ` by ${entry.decidedByName}` : ''
                      }`
                    : ''}
                </span>
                {canManage && entry.status === 'requested' ? (
                  decidingId === entry.id ? (
                    <Stack $gap={8} style={{ marginTop: 10 }}>
                      <Field>
                        <Label htmlFor={`decision-${entry.id}`}>
                          Decision notes
                        </Label>
                        <Textarea
                          id={`decision-${entry.id}`}
                          value={decisionNotes}
                          onChange={(event) => setDecisionNotes(event.target.value)}
                          maxLength={2_000}
                          style={{ minHeight: 60 }}
                          disabled={saving}
                        />
                      </Field>
                      <Actions>
                        <Button
                          type="button"
                          disabled={saving}
                          onClick={() => decide(entry.id, 'approved')}
                        >
                          {saving ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <Check size={14} />
                          )}
                          Approve
                        </Button>
                        <Button
                          type="button"
                          $variant="danger"
                          disabled={saving}
                          onClick={() => decide(entry.id, 'rejected')}
                        >
                          Reject
                        </Button>
                        <Button
                          type="button"
                          $variant="ghost"
                          disabled={saving}
                          onClick={() => {
                            setDecidingId(null);
                            setDecisionNotes('');
                          }}
                        >
                          Cancel
                        </Button>
                      </Actions>
                    </Stack>
                  ) : (
                    <Actions style={{ marginTop: 10 }}>
                      <Button
                        type="button"
                        onClick={() => {
                          setDecidingId(entry.id);
                          setDecisionNotes('');
                        }}
                      >
                        Record decision
                      </Button>
                    </Actions>
                  )
                ) : null}
              </TimelineItem>
            );
          })}
        </Timeline>
      )}
    </Card>
  );
}
