'use client';

import { useMemo, useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Save, ShieldAlert, X } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Button,
  ErrorText,
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
import {
  REQUIREMENT_STATUS_META,
} from '@/components/workspace/phase2d/meta';

const schema = yup.object({
  serviceId: yup.string(),
  name: yup
    .string()
    .trim()
    .min(2, 'Requirement name must be at least 2 characters.')
    .max(200, 'Requirement name must be 200 characters or fewer.')
    .required('Requirement name is required.'),
  description: yup
    .string()
    .trim()
    .max(2_000, 'Description must be 2,000 characters or fewer.'),
  priority: yup.string().oneOf(['low', 'medium', 'high', 'urgent']).required(),
  status: yup
    .string()
    .oneOf(['requested', 'in_review', 'confirmed', 'deferred'])
    .required(),
});

function initialValues(requirement) {
  return {
    serviceId: requirement?.serviceId || '',
    name: requirement?.name || '',
    description: requirement?.description || '',
    priority: requirement?.priority || 'medium',
    status: requirement?.status || 'requested',
  };
}

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function RequirementForm({
  opportunityId,
  requirement = null,
  services = [],
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(requirement);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const service of services) {
      const key = service.categoryName || 'Services';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(service);
    }
    return [...map.entries()];
  }, [services]);

  const formik = useFormik({
    initialValues: initialValues(requirement),
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      const payload = {
        serviceId: values.serviceId || null,
        name: values.name.trim(),
        description: textOrNull(values.description),
        priority: values.priority,
        status: values.status,
      };

      try {
        const result = editing
          ? await apiRequest(
              `/api/workforce/opportunities/${opportunityId}/requirements/${requirement.id}`,
              { method: 'PATCH', body: payload },
            )
          : await apiRequest(
              `/api/workforce/opportunities/${opportunityId}/requirements`,
              { method: 'POST', body: payload },
            );
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

  const selected = services.find(
    (service) => service.id === formik.values.serviceId,
  );

  function handleServiceChange(event) {
    const serviceId = event.target.value;
    formik.handleChange(event);
    const picked = services.find((service) => service.id === serviceId);
    if (picked && !formik.values.name.trim()) {
      formik.setFieldValue('name', picked.name);
    }
  }

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={12}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor={`req-service-${requirement?.id || 'new'}`}>
              Catalogue service
            </Label>
            <Select
              id={`req-service-${requirement?.id || 'new'}`}
              name="serviceId"
              value={formik.values.serviceId}
              onChange={handleServiceChange}
              disabled={formik.isSubmitting}
            >
              <option value="">No catalogue link</option>
              {grouped.map(([category, items]) => (
                <optgroup key={category} label={category}>
                  {items.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                      {service.regulated ? ' · regulated' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <Hint>
              Linking a service keeps the requirement connected to the
              catalogue. The name below is still editable.
            </Hint>
          </Field>

          <Field>
            <Label htmlFor={`req-name-${requirement?.id || 'new'}`}>
              Requirement name
            </Label>
            <Input
              id={`req-name-${requirement?.id || 'new'}`}
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              placeholder="E-commerce storefront rebuild"
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.name ? (
              <ErrorText>{formik.errors.name}</ErrorText>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor={`req-priority-${requirement?.id || 'new'}`}>
              Priority
            </Label>
            <Select
              id={`req-priority-${requirement?.id || 'new'}`}
              name="priority"
              value={formik.values.priority}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>

          <Field>
            <Label htmlFor={`req-status-${requirement?.id || 'new'}`}>
              Requirement status
            </Label>
            <Select
              id={`req-status-${requirement?.id || 'new'}`}
              name="status"
              value={formik.values.status}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {Object.entries(REQUIREMENT_STATUS_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </Field>
        </Grid>

        <Field>
          <Label htmlFor={`req-desc-${requirement?.id || 'new'}`}>
            Description
          </Label>
          <Textarea
            id={`req-desc-${requirement?.id || 'new'}`}
            name="description"
            value={formik.values.description}
            onChange={formik.handleChange}
            maxLength={2_000}
            style={{ minHeight: 76 }}
            placeholder="Scope, dependencies or acceptance notes for this requirement."
            disabled={formik.isSubmitting}
          />
          {formik.errors.description ? (
            <ErrorText>{formik.errors.description}</ErrorText>
          ) : null}
        </Field>

        {selected?.regulated ? (
          <Notice $tone="warning">
            <ShieldAlert size={15} />
            <span>
              This is a regulated service. The responsible professional is{' '}
              <strong>{selected.reviewProfession || 'not yet recorded'}</strong>.
              Review, certification, signing and filing stay with that qualified
              professional and are never performed by AI.
            </span>
          </Notice>
        ) : null}

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting
              ? 'Saving…'
              : editing
                ? 'Update requirement'
                : 'Add requirement'}
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
