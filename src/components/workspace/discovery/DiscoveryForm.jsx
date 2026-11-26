'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
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
  Row,
  Select,
  Textarea,
} from '@/components/workspace/ai/primitives';
import {
  FREQUENCY_LABELS,
  WEBSITE_PRESENCE_LABELS,
} from '@/components/workspace/discovery/meta';

const EMPTY = {
  name: '',
  provider: 'public_web_search',
  frequency: 'manual',
  dailyLimit: '20',
  maxResearchOps: '20',
  budgetCents: '0',
  services: '',
  city: '',
  area: '',
  state: '',
  country: '',
  industry: '',
  businessSize: '',
  websitePresence: 'any',
  keywords: '',
  qualityCriteria: '',
  startDate: '',
  endDate: '',
};

function dateInput(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function initialValues(campaign) {
  if (!campaign) return { ...EMPTY };
  const criteria = campaign.criteria || {};
  return {
    name: campaign.name || '',
    provider: campaign.provider || 'public_web_search',
    frequency: campaign.frequency || 'manual',
    dailyLimit: String(campaign.dailyLimit ?? 20),
    maxResearchOps: String(campaign.maxResearchOps ?? 20),
    budgetCents: String(campaign.budgetCents ?? 0),
    services: (campaign.services || []).join(', '),
    city: criteria.city || '',
    area: criteria.area || '',
    state: criteria.state || '',
    country: criteria.country || '',
    industry: criteria.industry || '',
    businessSize: criteria.businessSize || '',
    websitePresence: criteria.websitePresence || 'any',
    keywords: criteria.keywords || '',
    qualityCriteria: criteria.qualityCriteria || '',
    startDate: dateInput(campaign.startDate),
    endDate: dateInput(campaign.endDate),
  };
}

export default function DiscoveryForm({
  campaign = null,
  readiness,
  onDone,
  onCancel,
}) {
  const [values, setValues] = useState(() => initialValues(campaign));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const providers = readiness?.providers || [];
  const selectedProvider = providers.find((item) => item.key === values.provider);
  const editing = Boolean(campaign);

  function setField(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function body() {
    return {
      name: values.name,
      provider: values.provider,
      frequency: values.frequency,
      dailyLimit: Number(values.dailyLimit),
      maxResearchOps: Number(values.maxResearchOps),
      budgetCents: Number(values.budgetCents || 0),
      services: values.services
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      criteria: {
        city: values.city,
        area: values.area,
        state: values.state,
        country: values.country,
        industry: values.industry,
        businessSize: values.businessSize,
        websitePresence: values.websitePresence,
        keywords: values.keywords,
        qualityCriteria: values.qualityCriteria,
      },
      startDate: values.startDate || null,
      endDate: values.endDate || null,
    };
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const data = await apiRequest(
        editing
          ? `/api/workforce/discovery/${campaign.id}`
          : '/api/workforce/discovery',
        { method: editing ? 'PATCH' : 'POST', body: body() },
      );
      if (onDone) onDone(data.campaign);
    } catch (error) {
      if (error.details && typeof error.details === 'object') {
        setErrors(error.details);
      }
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Grid $cols={2}>
        <Field>
          <Label htmlFor="discovery-name">Campaign name</Label>
          <Input
            id="discovery-name"
            value={values.name}
            onChange={(event) => setField('name', event.target.value)}
            placeholder="e.g. Manchester dental clinics"
            maxLength={160}
            required
          />
          {errors.name ? <ErrorText>{errors.name}</ErrorText> : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-provider">Discovery source</Label>
          <Select
            id="discovery-provider"
            value={values.provider}
            onChange={(event) => setField('provider', event.target.value)}
          >
            {providers.map((provider) => (
              <option key={provider.key} value={provider.key}>
                {provider.label}
                {provider.configured ? '' : ' — not configured'}
              </option>
            ))}
          </Select>
          <Hint>
            {selectedProvider
              ? selectedProvider.configured
                ? `Configured through ${selectedProvider.envKeys.join(' or ')}. ${selectedProvider.verification}`
                : `Not configured. Add ${selectedProvider.envKeys.join(' or ')} before running. No businesses are invented when the source is unavailable.`
              : 'Choose a discovery source.'}
          </Hint>
          {errors.provider ? <ErrorText>{errors.provider}</ErrorText> : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-frequency">Schedule</Label>
          <Select
            id="discovery-frequency"
            value={values.frequency}
            onChange={(event) => setField('frequency', event.target.value)}
          >
            {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Hint>Daily and weekly schedules run through the existing worker.</Hint>
          {errors.frequency ? <ErrorText>{errors.frequency}</ErrorText> : null}
        </Field>

        <Row>
          <Field>
            <Label htmlFor="discovery-daily-limit">Daily qualified limit</Label>
            <Input
              id="discovery-daily-limit"
              type="number"
              min="1"
              max="50"
              value={values.dailyLimit}
              onChange={(event) => setField('dailyLimit', event.target.value)}
            />
            {errors.dailyLimit ? <ErrorText>{errors.dailyLimit}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor="discovery-research-ops">Max research ops</Label>
            <Input
              id="discovery-research-ops"
              type="number"
              min="0"
              max="100"
              value={values.maxResearchOps}
              onChange={(event) => setField('maxResearchOps', event.target.value)}
            />
            {errors.maxResearchOps ? (
              <ErrorText>{errors.maxResearchOps}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="discovery-budget">AI budget (cents)</Label>
            <Input
              id="discovery-budget"
              type="number"
              min="0"
              value={values.budgetCents}
              onChange={(event) => setField('budgetCents', event.target.value)}
            />
            <Hint>0 turns AI scoring off; records are still captured from the source.</Hint>
            {errors.budgetCents ? <ErrorText>{errors.budgetCents}</ErrorText> : null}
          </Field>
        </Row>

        <Field>
          <Label htmlFor="discovery-services">Target services (comma-separated)</Label>
          <Input
            id="discovery-services"
            value={values.services}
            onChange={(event) => setField('services', event.target.value)}
            placeholder="Website redesign, local SEO"
          />
          {errors.services ? <ErrorText>{errors.services}</ErrorText> : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-industry">Industry</Label>
          <Input
            id="discovery-industry"
            value={values.industry}
            onChange={(event) => setField('industry', event.target.value)}
            placeholder="Dental clinics"
            maxLength={160}
          />
          {errors['criteria.industry'] ? (
            <ErrorText>{errors['criteria.industry']}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-city">City</Label>
          <Input
            id="discovery-city"
            value={values.city}
            onChange={(event) => setField('city', event.target.value)}
            maxLength={120}
          />
          {errors['criteria.city'] ? (
            <ErrorText>{errors['criteria.city']}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-area">Area or neighbourhood</Label>
          <Input
            id="discovery-area"
            value={values.area}
            onChange={(event) => setField('area', event.target.value)}
            maxLength={120}
          />
          {errors['criteria.area'] ? (
            <ErrorText>{errors['criteria.area']}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-state">State or region</Label>
          <Input
            id="discovery-state"
            value={values.state}
            onChange={(event) => setField('state', event.target.value)}
            maxLength={120}
          />
          {errors['criteria.state'] ? (
            <ErrorText>{errors['criteria.state']}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-country">Country</Label>
          <Input
            id="discovery-country"
            value={values.country}
            onChange={(event) => setField('country', event.target.value)}
            maxLength={120}
          />
          {errors['criteria.country'] ? (
            <ErrorText>{errors['criteria.country']}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-size">Business size</Label>
          <Input
            id="discovery-size"
            value={values.businessSize}
            onChange={(event) => setField('businessSize', event.target.value)}
            placeholder="Small, single location"
            maxLength={80}
          />
          {errors['criteria.businessSize'] ? (
            <ErrorText>{errors['criteria.businessSize']}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-website">Website presence</Label>
          <Select
            id="discovery-website"
            value={values.websitePresence}
            onChange={(event) => setField('websitePresence', event.target.value)}
          >
            {Object.entries(WEBSITE_PRESENCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          {errors['criteria.websitePresence'] ? (
            <ErrorText>{errors['criteria.websitePresence']}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-keywords">Keywords</Label>
          <Input
            id="discovery-keywords"
            value={values.keywords}
            onChange={(event) => setField('keywords', event.target.value)}
            maxLength={500}
          />
          {errors['criteria.keywords'] ? (
            <ErrorText>{errors['criteria.keywords']}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-quality">Quality criteria</Label>
          <Textarea
            id="discovery-quality"
            value={values.qualityCriteria}
            onChange={(event) => setField('qualityCriteria', event.target.value)}
            placeholder="Good reviews, no website, active social profiles"
            maxLength={1000}
          />
          {errors['criteria.qualityCriteria'] ? (
            <ErrorText>{errors['criteria.qualityCriteria']}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-start">Start date</Label>
          <Input
            id="discovery-start"
            type="date"
            value={values.startDate}
            onChange={(event) => setField('startDate', event.target.value)}
          />
          {errors.startDate ? <ErrorText>{errors.startDate}</ErrorText> : null}
        </Field>

        <Field>
          <Label htmlFor="discovery-end">End date</Label>
          <Input
            id="discovery-end"
            type="date"
            value={values.endDate}
            onChange={(event) => setField('endDate', event.target.value)}
          />
          {errors.endDate ? <ErrorText>{errors.endDate}</ErrorText> : null}
        </Field>
      </Grid>

      {message ? <ErrorText>{message}</ErrorText> : null}

      <Actions>
        <Button type="submit" $variant="primary" disabled={busy}>
          {busy ? <Loader2 size={16} /> : <Save size={16} />}
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create campaign'}
        </Button>
        {onCancel ? (
          <Button type="button" $variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </Actions>
    </form>
  );
}
