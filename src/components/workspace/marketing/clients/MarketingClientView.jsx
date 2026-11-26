'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormik } from 'formik';
import { Loader2, Save } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  CheckGrid,
  CheckLabel,
  ErrorText,
  Eyebrow,
  Field,
  Grid,
  Header,
  Hint,
  Input,
  Label,
  Lead,
  LinkButton,
  Notice,
  Page,
  Stack,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import { MetaGrid } from '@/components/workspace/phase2c/ui';
import { apiRequest } from '@/lib/ai/client';
import { MARKETING_SERVICES } from '@/lib/marketing/constants';
import MarketingNav from '../MarketingNav';

function toLines(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function fromLines(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function MarketingClientView({ detail, canManage }) {
  const { client, profile, createdByName, counts } = detail;
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);

  const formik = useFormik({
    initialValues: {
      businessDescription: profile?.businessDescription || '',
      industry: profile?.industry || client.industry || '',
      targetAudience: profile?.targetAudience || '',
      targetLocations: toLines(profile?.targetLocations),
      serviceAreas: toLines(profile?.serviceAreas),
      websiteUrl: profile?.websiteUrl || client.website || '',
      businessGoals: profile?.businessGoals || '',
      competitors: profile?.competitors || '',
      brandVoice: profile?.brandVoice || '',
      communicationGuidelines: profile?.communicationGuidelines || '',
      contentLanguage: profile?.contentLanguage || 'en',
      marketingNotes: profile?.marketingNotes || '',
      availableServices: profile?.availableServices || [],
      selectedServices: profile?.selectedServices || [],
    },
    onSubmit: async (values, helpers) => {
      setFailure(null);
      setNotice(null);
      try {
        const result = await apiRequest(
          `/api/workforce/marketing/clients/${client.id}`,
          {
            method: 'PUT',
            body: {
              businessDescription: values.businessDescription || null,
              industry: values.industry || null,
              targetAudience: values.targetAudience || null,
              targetLocations: fromLines(values.targetLocations),
              serviceAreas: fromLines(values.serviceAreas),
              websiteUrl: values.websiteUrl || null,
              businessGoals: values.businessGoals || null,
              competitors: values.competitors || null,
              brandVoice: values.brandVoice || null,
              communicationGuidelines: values.communicationGuidelines || null,
              contentLanguage: values.contentLanguage || 'en',
              marketingNotes: values.marketingNotes || null,
              availableServices: values.availableServices,
              selectedServices: values.selectedServices,
            },
          },
        );
        setNotice('Marketing profile saved.');
        const next = result.profile;
        if (next) {
          helpers.resetForm({
            values: {
              ...values,
              availableServices: next.availableServices || [],
              selectedServices: next.selectedServices || [],
            },
          });
        }
      } catch (error) {
        setFailure(error.message);
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  function toggle(field, key) {
    const current = formik.values[field] || [];
    const next = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    formik.setFieldValue(field, next);
  }

  const disabled = !canManage || formik.isSubmitting;

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/marketing/clients">Client setup</Link> ·{' '}
          {client.reference}
        </Eyebrow>
        <Title>{client.companyName}</Title>
        <Lead>
          Marketing context for planning content and campaigns. This page never
          contacts the client or changes their website.
        </Lead>
      </Header>
      <MarketingNav />

      {notice ? <Notice $tone="success">{notice}</Notice> : null}
      {failure ? (
        <Notice $tone="danger">
          <ErrorText>{failure}</ErrorText>
        </Notice>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Marketing overview</CardTitle>
            <CardText>
              {profile
                ? `Profile created by ${createdByName || 'a workspace member'} ${
                    profile.status === 'active' ? 'and active' : ''
                  }.`
                : 'No marketing profile exists yet.'}
            </CardText>
          </div>
          <Badge $tone={profile ? 'success' : 'muted'}>
            {profile ? 'Profile configured' : 'Needs setup'}
          </Badge>
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Campaigns</dt>
            <dd>{counts.campaigns}</dd>
          </div>
          <div>
            <dt>Content records</dt>
            <dd>{counts.content}</dd>
          </div>
          <div>
            <dt>Website proposals</dt>
            <dd>{counts.proposals}</dd>
          </div>
          <div>
            <dt>Client reference</dt>
            <dd>{client.reference}</dd>
          </div>
        </MetaGrid>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <LinkButton href={`/workspace/marketing/campaigns?clientId=${client.id}`}>
            Campaigns
          </LinkButton>
          <LinkButton href={`/workspace/marketing/content?clientId=${client.id}`}>
            Content
          </LinkButton>
          <LinkButton href={`/workspace/marketing/reports?clientId=${client.id}`}>
            Reports
          </LinkButton>
          <LinkButton href={`/workspace/clients/${client.id}`}>
            Client record
          </LinkButton>
        </div>
      </Card>

      <form onSubmit={formik.handleSubmit}>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Business context</CardTitle>
              <CardText>
                Used as planning context for drafts. Unsupported claims must be
                marked for verification rather than invented.
              </CardText>
            </div>
          </CardHead>
          <Grid $cols={2}>
            <Field>
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                name="industry"
                value={formik.values.industry}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
            <Field>
              <Label htmlFor="websiteUrl">Website URL</Label>
              <Input
                id="websiteUrl"
                name="websiteUrl"
                placeholder="https://"
                value={formik.values.websiteUrl}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
            <Field style={{ gridColumn: '1 / -1' }}>
              <Label htmlFor="businessDescription">Business description</Label>
              <Textarea
                id="businessDescription"
                name="businessDescription"
                rows={4}
                value={formik.values.businessDescription}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
            <Field style={{ gridColumn: '1 / -1' }}>
              <Label htmlFor="targetAudience">Target audience</Label>
              <Textarea
                id="targetAudience"
                name="targetAudience"
                rows={3}
                value={formik.values.targetAudience}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
            <Field>
              <Label htmlFor="targetLocations">
                Target locations (one per line)
              </Label>
              <Textarea
                id="targetLocations"
                name="targetLocations"
                rows={3}
                value={formik.values.targetLocations}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
            <Field>
              <Label htmlFor="serviceAreas">Service areas (one per line)</Label>
              <Textarea
                id="serviceAreas"
                name="serviceAreas"
                rows={3}
                value={formik.values.serviceAreas}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
          </Grid>
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>Goals and voice</CardTitle>
              <CardText>
                Plans and drafts must stay consistent with these notes. Budgets
                are planning estimates only.
              </CardText>
            </div>
          </CardHead>
          <Grid $cols={2}>
            <Field style={{ gridColumn: '1 / -1' }}>
              <Label htmlFor="businessGoals">Business goals</Label>
              <Textarea
                id="businessGoals"
                name="businessGoals"
                rows={3}
                value={formik.values.businessGoals}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
            <Field style={{ gridColumn: '1 / -1' }}>
              <Label htmlFor="competitors">Competitors</Label>
              <Textarea
                id="competitors"
                name="competitors"
                rows={3}
                value={formik.values.competitors}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
            <Field>
              <Label htmlFor="brandVoice">Brand voice</Label>
              <Textarea
                id="brandVoice"
                name="brandVoice"
                rows={3}
                value={formik.values.brandVoice}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
            <Field>
              <Label htmlFor="contentLanguage">Content language</Label>
              <Input
                id="contentLanguage"
                name="contentLanguage"
                value={formik.values.contentLanguage}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
            <Field style={{ gridColumn: '1 / -1' }}>
              <Label htmlFor="communicationGuidelines">
                Communication guidelines
              </Label>
              <Textarea
                id="communicationGuidelines"
                name="communicationGuidelines"
                rows={3}
                value={formik.values.communicationGuidelines}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
            <Field style={{ gridColumn: '1 / -1' }}>
              <Label htmlFor="marketingNotes">Marketing notes</Label>
              <Textarea
                id="marketingNotes"
                name="marketingNotes"
                rows={4}
                value={formik.values.marketingNotes}
                onChange={formik.handleChange}
                disabled={disabled}
              />
            </Field>
          </Grid>
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>Services</CardTitle>
              <CardText>
                Select the services delivered to this client. Selected services
                are also treated as available.
              </CardText>
            </div>
          </CardHead>
          <Stack $gap={10}>
            <Label>Selected services</Label>
            <CheckGrid>
              {MARKETING_SERVICES.map((service) => (
                <CheckLabel key={`selected-${service.key}`}>
                  <input
                    type="checkbox"
                    checked={formik.values.selectedServices.includes(service.key)}
                    onChange={() => toggle('selectedServices', service.key)}
                    disabled={disabled}
                  />
                  {service.label}
                </CheckLabel>
              ))}
            </CheckGrid>
            <Label>Additional available services</Label>
            <CheckGrid>
              {MARKETING_SERVICES.map((service) => (
                <CheckLabel key={`available-${service.key}`}>
                  <input
                    type="checkbox"
                    checked={formik.values.availableServices.includes(service.key)}
                    onChange={() => toggle('availableServices', service.key)}
                    disabled={disabled}
                  />
                  {service.label}
                </CheckLabel>
              ))}
            </CheckGrid>
          </Stack>
        </Card>

        {canManage ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" $primary disabled={formik.isSubmitting}>
              {formik.isSubmitting ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Save size={14} />
              )}
              Save profile
            </Button>
          </div>
        ) : (
          <Hint>Your role can view this profile but cannot change it.</Hint>
        )}
      </form>
    </Page>
  );
}
