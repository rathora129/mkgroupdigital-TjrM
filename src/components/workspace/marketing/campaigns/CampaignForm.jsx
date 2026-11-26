'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import { Loader2, Megaphone } from 'lucide-react';
import {
  Actions,
  Button,
  ErrorText,
  Field,
  Grid,
  Input,
  Label,
  Notice,
  Select,
  Textarea,
} from '@/components/workspace/ai/primitives';
import { apiRequest } from '@/lib/ai/client';
import { MARKETING_CHANNELS } from '@/lib/marketing/constants';
import { toIsoDate } from '../meta';

export default function CampaignForm({ options, onDone, onCancel }) {
  const [failure, setFailure] = useState(null);

  const formik = useFormik({
    initialValues: {
      clientId: '',
      projectId: '',
      name: '',
      objective: '',
      objectiveDescription: '',
      targetAudience: '',
      targetGeography: '',
      channel: 'organic_seo',
      startDate: '',
      endDate: '',
      budgetEstimate: '',
      currency: 'INR',
      successMetrics: '',
      ownerUserId: '',
      notes: '',
      status: 'planned',
    },
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest('/api/workforce/marketing/campaigns', {
          method: 'POST',
          body: {
            clientId: values.clientId,
            projectId: values.projectId || null,
            name: values.name,
            objective: values.objective || null,
            objectiveDescription: values.objectiveDescription || null,
            targetAudience: values.targetAudience || null,
            targetGeography: values.targetGeography || null,
            channel: values.channel,
            startDate: toIsoDate(values.startDate),
            endDate: toIsoDate(values.endDate),
            budgetEstimate: values.budgetEstimate
              ? Math.round(Number(values.budgetEstimate) * 100)
              : 0,
            currency: values.currency || 'INR',
            successMetrics: values.successMetrics || null,
            ownerUserId: values.ownerUserId || null,
            notes: values.notes || null,
            status: values.status,
          },
        });
        onDone(result);
      } catch (error) {
        setFailure(error.message);
        helpers.setSubmitting(false);
      }
    },
  });

  const clientProjects = options.projects.filter(
    (project) => !formik.values.clientId || project.clientId === formik.values.clientId,
  );

  return (
    <form onSubmit={formik.handleSubmit}>
      {failure ? (
        <Notice $tone="danger">
          <ErrorText>{failure}</ErrorText>
        </Notice>
      ) : null}
      <Notice $tone="info">
        <Megaphone size={15} />
        <span>
          Campaigns are planning records. Starting or scheduling a campaign here
          never activates ads, spends money or contacts a platform.
        </span>
      </Notice>

      <Grid $cols={2}>
        <Field>
          <Label htmlFor="clientId">Client</Label>
          <Select
            id="clientId"
            name="clientId"
            value={formik.values.clientId}
            onChange={(event) => {
              formik.handleChange(event);
              formik.setFieldValue('projectId', '');
            }}
            required
          >
            <option value="">Choose a client</option>
            {options.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.companyName} ({client.reference})
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="projectId">Project (optional)</Label>
          <Select
            id="projectId"
            name="projectId"
            value={formik.values.projectId}
            onChange={formik.handleChange}
          >
            <option value="">No project</option>
            {clientProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.reference})
              </option>
            ))}
          </Select>
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="name">Campaign name</Label>
          <Input
            id="name"
            name="name"
            value={formik.values.name}
            onChange={formik.handleChange}
            required
          />
        </Field>
        <Field>
          <Label htmlFor="channel">Channel</Label>
          <Select
            id="channel"
            name="channel"
            value={formik.values.channel}
            onChange={formik.handleChange}
          >
            {MARKETING_CHANNELS.map((channel) => (
              <option key={channel.key} value={channel.key}>
                {channel.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="status">Starting state</Label>
          <Select
            id="status"
            name="status"
            value={formik.values.status}
            onChange={formik.handleChange}
          >
            <option value="planned">Planned</option>
            <option value="draft">Draft</option>
          </Select>
        </Field>
        <Field>
          <Label htmlFor="objective">Objective</Label>
          <Input
            id="objective"
            name="objective"
            value={formik.values.objective}
            onChange={formik.handleChange}
            placeholder="Awareness, leads, local visibility…"
          />
        </Field>
        <Field>
          <Label htmlFor="targetGeography">Target geography</Label>
          <Input
            id="targetGeography"
            name="targetGeography"
            value={formik.values.targetGeography}
            onChange={formik.handleChange}
          />
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="objectiveDescription">Objective details</Label>
          <Textarea
            id="objectiveDescription"
            name="objectiveDescription"
            rows={3}
            value={formik.values.objectiveDescription}
            onChange={formik.handleChange}
          />
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="targetAudience">Target audience</Label>
          <Textarea
            id="targetAudience"
            name="targetAudience"
            rows={2}
            value={formik.values.targetAudience}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="startDate">Start date</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            value={formik.values.startDate}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="endDate">End date</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            value={formik.values.endDate}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="budgetEstimate">Budget estimate (planning only)</Label>
          <Input
            id="budgetEstimate"
            name="budgetEstimate"
            type="number"
            step="0.01"
            min="0"
            value={formik.values.budgetEstimate}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            value={formik.values.currency}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="ownerUserId">Owner (optional)</Label>
          <Select
            id="ownerUserId"
            name="ownerUserId"
            value={formik.values.ownerUserId}
            onChange={formik.handleChange}
          >
            <option value="">Unassigned</option>
            {options.members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name || member.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="successMetrics">Success metrics</Label>
          <Input
            id="successMetrics"
            name="successMetrics"
            value={formik.values.successMetrics}
            onChange={formik.handleChange}
          />
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            value={formik.values.notes}
            onChange={formik.handleChange}
          />
        </Field>
      </Grid>

      <Actions>
        <Button type="submit" $primary disabled={formik.isSubmitting}>
          {formik.isSubmitting ? (
            <Loader2 size={14} className="spin" />
          ) : null}
          Create campaign plan
        </Button>
        <Button type="button" $variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </Actions>
    </form>
  );
}
