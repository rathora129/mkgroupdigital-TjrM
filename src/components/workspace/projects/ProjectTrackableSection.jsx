'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Plus, Save, X } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import { formatDate, formatDateTime } from '@/lib/ai/format';
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
  Grid,
  Hint,
  Input,
  Label,
  Notice,
  Select,
  Stack,
  Table,
  TableWrap,
  Textarea,
} from '@/components/workspace/ai/primitives';
import { Subhead } from '@/components/workspace/phase2c/ui';
import {
  CLIENT_APPROVAL_META,
  dateInputValue,
  metaFor,
  REVIEW_STATUS_META,
  toIsoDate,
} from './meta';

const schema = yup.object({
  title: yup
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters.')
    .max(200, 'Title must be 200 characters or fewer.')
    .required('Title is required.'),
  description: yup.string().trim().max(4_000, 'Description is too long.'),
  targetDate: yup.string(),
  completionDate: yup.string(),
  ownerUserId: yup.string(),
  reviewStatus: yup
    .string()
    .oneOf(['pending', 'in_review', 'approved', 'changes_requested'])
    .required(),
  clientApprovalStatus: yup
    .string()
    .oneOf(['not_requested', 'pending', 'approved', 'rejected'])
    .required(),
  evidenceNotes: yup.string().trim().max(4_000, 'Evidence notes are too long.'),
});

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function TrackableForm({ kind, projectId, item, members, onDone, onCancel }) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(item);

  const formik = useFormik({
    initialValues: {
      title: item?.title || '',
      description: item?.description || '',
      targetDate: dateInputValue(item?.targetDate),
      completionDate: dateInputValue(item?.completionDate),
      ownerUserId: item?.ownerUserId || '',
      reviewStatus: item?.reviewStatus || 'pending',
      clientApprovalStatus: item?.clientApprovalStatus || 'not_requested',
      evidenceNotes: item?.evidenceNotes || '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      const payload = {
        title: values.title.trim(),
        description: textOrNull(values.description),
        targetDate: toIsoDate(values.targetDate),
        completionDate: toIsoDate(values.completionDate),
        ownerUserId: values.ownerUserId || null,
        reviewStatus: values.reviewStatus,
        clientApprovalStatus: values.clientApprovalStatus,
        evidenceNotes: textOrNull(values.evidenceNotes),
      };
      try {
        const result = editing
          ? await apiRequest(
              `/api/workforce/projects/${projectId}/${kind}s/${item.id}`,
              { method: 'PATCH', body: payload },
            )
          : await apiRequest(`/api/workforce/projects/${projectId}/${kind}s`, {
              method: 'POST',
              body: payload,
            });
        onDone?.(result);
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

  const label = kind === 'milestone' ? 'milestone' : 'deliverable';

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor={`${kind}-title`}>Title</Label>
            <Input
              id={`${kind}-title`}
              name="title"
              value={formik.values.title}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.title ? <ErrorText>{formik.errors.title}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor={`${kind}-owner`}>Owner</Label>
            <Select
              id={`${kind}-owner`}
              name="ownerUserId"
              value={formik.values.ownerUserId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor={`${kind}-target`}>Target date</Label>
            <Input
              id={`${kind}-target`}
              name="targetDate"
              type="date"
              value={formik.values.targetDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor={`${kind}-completion`}>Completion date</Label>
            <Input
              id={`${kind}-completion`}
              name="completionDate"
              type="date"
              value={formik.values.completionDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor={`${kind}-review`}>Internal review</Label>
            <Select
              id={`${kind}-review`}
              name="reviewStatus"
              value={formik.values.reviewStatus}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="pending">Pending review</option>
              <option value="in_review">In review</option>
              <option value="approved">Approved</option>
              <option value="changes_requested">Changes requested</option>
            </Select>
          </Field>
          <Field>
            <Label htmlFor={`${kind}-client`}>Client approval</Label>
            <Select
              id={`${kind}-client`}
              name="clientApprovalStatus"
              value={formik.values.clientApprovalStatus}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="not_requested">Not requested</option>
              <option value="pending">Awaiting client</option>
              <option value="approved">Client approved</option>
              <option value="rejected">Client rejected</option>
            </Select>
            <Hint>
              Client approval is a recorded status only. MK Group Digital does
              not contact the client from this screen.
            </Hint>
          </Field>
        </Grid>

        <Field>
          <Label htmlFor={`${kind}-description`}>Description</Label>
          <Textarea
            id={`${kind}-description`}
            name="description"
            value={formik.values.description}
            onChange={formik.handleChange}
            maxLength={4_000}
            style={{ minHeight: 70 }}
            disabled={formik.isSubmitting}
          />
          {formik.errors.description ? (
            <ErrorText>{formik.errors.description}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor={`${kind}-evidence`}>Evidence notes</Label>
          <Textarea
            id={`${kind}-evidence`}
            name="evidenceNotes"
            value={formik.values.evidenceNotes}
            onChange={formik.handleChange}
            maxLength={4_000}
            style={{ minHeight: 70 }}
            placeholder={`Link or describe the ${label} evidence held internally.`}
            disabled={formik.isSubmitting}
          />
        </Field>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting ? 'Saving…' : editing ? 'Save changes' : `Add ${label}`}
          </Button>
          {onCancel ? (
            <Button
              type="button"
              $variant="ghost"
              onClick={onCancel}
              disabled={formik.isSubmitting}
            >
              <X size={14} />
              Cancel
            </Button>
          ) : null}
        </Actions>
      </Stack>
    </form>
  );
}

export default function ProjectTrackableSection({
  kind,
  projectId,
  items,
  members,
  canEdit,
  timezone,
  closed,
  onChanged,
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState(null);
  const plural = kind === 'milestone' ? 'Milestones' : 'Deliverables';
  const singular = kind === 'milestone' ? 'milestone' : 'deliverable';

  function done(message) {
    setShowCreate(false);
    setEditingId(null);
    setNotice(message);
    router.refresh();
    onChanged?.();
  }

  return (
    <Card>
      <CardHead>
        <div>
          <CardTitle>{plural}</CardTitle>
          <CardText>
            {items.length} {items.length === 1 ? singular : `${singular}s`}.
            Accepted proposal {singular}s are copied here when the project is
            created and can be tracked independently afterwards.
          </CardText>
        </div>
        {canEdit && !closed ? (
          <Actions>
            <Button
              type="button"
              $variant="primary"
              onClick={() => {
                setShowCreate((current) => !current);
                setEditingId(null);
              }}
            >
              <Plus size={14} />
              {showCreate ? 'Close form' : `Add ${singular}`}
            </Button>
          </Actions>
        ) : null}
      </CardHead>

      {notice ? <Notice $tone="success">{notice}</Notice> : null}

      {showCreate && canEdit && !closed ? (
        <Card $flat>
          <Subhead>New {singular}</Subhead>
          <TrackableForm
            kind={kind}
            projectId={projectId}
            members={members}
            onDone={() => done(`${singular[0].toUpperCase()}${singular.slice(1)} added.`)}
            onCancel={() => setShowCreate(false)}
          />
        </Card>
      ) : null}

      {items.length === 0 ? (
        <CardText>No {singular}s recorded yet.</CardText>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Owner</th>
                <th>Target</th>
                <th>Completed</th>
                <th>Review</th>
                <th>Client</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const review = metaFor(REVIEW_STATUS_META, item.reviewStatus);
                const client = metaFor(CLIENT_APPROVAL_META, item.clientApprovalStatus);
                return (
                  <tr key={item.id}>
                    <td>{item.displayOrder}</td>
                    <td>
                      {item.title}
                      {item.proposalMilestoneId || item.proposalDeliverableId ? (
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                          From accepted proposal
                        </div>
                      ) : null}
                    </td>
                    <td>{item.ownerName || 'Unassigned'}</td>
                    <td>{formatDate(item.targetDate, timezone)}</td>
                    <td>{formatDate(item.completionDate, timezone)}</td>
                    <td>
                      <Badge $tone={review.tone}>{review.label}</Badge>
                    </td>
                    <td>
                      <Badge $tone={client.tone}>{client.label}</Badge>
                    </td>
                    <td>
                      {canEdit && !closed ? (
                        <Button
                          type="button"
                          $variant="ghost"
                          onClick={() =>
                            setEditingId((current) =>
                              current === item.id ? null : item.id,
                            )
                          }
                        >
                          <Pencil size={13} />
                          {editingId === item.id ? 'Close' : 'Edit'}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {editingId ? (
        <Card $flat>
          <Subhead>
            Edit{' '}
            {items.find((entry) => entry.id === editingId)?.title || singular}
          </Subhead>
          <CardText>
            Last updated{' '}
            {formatDateTime(
              items.find((entry) => entry.id === editingId)?.updatedAt,
              timezone,
            )}
          </CardText>
          <TrackableForm
            kind={kind}
            projectId={projectId}
            item={items.find((entry) => entry.id === editingId)}
            members={members}
            onDone={() => done(`${singular[0].toUpperCase()}${singular.slice(1)} updated.`)}
            onCancel={() => setEditingId(null)}
          />
        </Card>
      ) : null}
    </Card>
  );
}
