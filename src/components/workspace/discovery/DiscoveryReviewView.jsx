'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSearch,
  Loader2,
  Pencil,
  XCircle,
} from 'lucide-react';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  EmptyState,
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
  Row,
  Select,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import {
  FilterBar,
  FilterField,
  ListPager,
  MetaGrid,
  TwoCol,
} from '@/components/workspace/phase2c/ui';
import { apiRequest } from '@/lib/ai/client';
import { formatDateTime } from '@/lib/ai/format';
import {
  PROSPECT_STATUS_META,
  TEMPERATURE_META,
  VERIFICATION_META,
  formatCount,
  metaFor,
  truncate,
} from '@/components/workspace/discovery/meta';

const STATUS_OPTIONS = [
  ['pending_review', 'Pending review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['duplicate', 'Duplicate'],
  ['all', 'All statuses'],
];

const TEMPERATURE_OPTIONS = [
  ['', 'Any temperature'],
  ['hot', 'Hot'],
  ['warm', 'Warm'],
  ['cold', 'Cold'],
  ['unknown', 'Unscored'],
];

const EDIT_FIELDS = [
  ['businessName', 'Business name'],
  ['contactName', 'Contact name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['website', 'Website'],
  ['city', 'City'],
  ['state', 'State / region'],
  ['country', 'Country'],
  ['industry', 'Industry'],
  ['recommendedService', 'Recommended service'],
  ['leadScore', 'Lead score (0-100)'],
  ['confidence', 'Confidence (0-100)'],
];

function hrefFor(query, page) {
  const params = new URLSearchParams();
  params.set('status', query.status || 'pending_review');
  if (query.temperature) params.set('temperature', query.temperature);
  if (query.campaignId) params.set('campaignId', query.campaignId);
  if (query.search) params.set('search', query.search);
  if (page > 1) params.set('page', String(page));
  return `/workspace/discovery/review?${params.toString()}`;
}

function editValuesFrom(prospect) {
  return {
    businessName: prospect.businessName || '',
    contactName: prospect.contactName || '',
    phone: prospect.phone || '',
    email: prospect.email || '',
    website: prospect.website || '',
    city: prospect.city || '',
    state: prospect.state || '',
    country: prospect.country || '',
    industry: prospect.industry || '',
    recommendedService: prospect.recommendedService || '',
    leadScore: prospect.leadScore == null ? '' : String(prospect.leadScore),
    temperature: prospect.temperature || 'unknown',
    confidence: prospect.confidence == null ? '' : String(prospect.confidence),
    reason: prospect.reason || '',
    pitch: prospect.pitch || '',
    callingApproach: prospect.callingApproach || '',
    nextAction: prospect.nextAction || '',
    qualificationQuestions: (prospect.qualificationQuestions || []).join('\n'),
  };
}

function friendlyReason(reason) {
  return {
    email: 'email match',
    website: 'website match',
    company: 'company name match',
  }[reason] || reason;
}

export default function DiscoveryReviewView({
  prospects,
  query,
  members,
  campaigns,
  canReview,
  timezone,
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [note, setNote] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [duplicateLeadId, setDuplicateLeadId] = useState('');
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState(null);
  const [editErrors, setEditErrors] = useState({});

  function clearMessages() {
    setError(null);
    setNotice(null);
  }

  async function selectProspect(id) {
    if (selectedId === id && detail) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    setSelectedId(id);
    setDetail(null);
    setEditing(false);
    setNote('');
    setAssignedUserId('');
    setDuplicateLeadId('');
    setError(null);
    setNotice(null);
    setLoadingDetail(true);
    try {
      const result = await apiRequest(
        `/api/workforce/discovery/prospects/${id}`,
      );
      setDetail(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function reloadDetail(id) {
    try {
      const result = await apiRequest(
        `/api/workforce/discovery/prospects/${id}`,
      );
      setDetail(result);
    } catch {
      setDetail(null);
      setSelectedId(null);
    }
  }

  async function review(action, extra = {}) {
    if (!detail) return;
    setBusy(action);
    clearMessages();
    try {
      const result = await apiRequest(
        `/api/workforce/discovery/prospects/${detail.prospect.id}/review`,
        {
          method: 'POST',
          body: { action, note: note || null, ...extra },
        },
      );
      if (action === 'edit') {
        setEditing(false);
        setEditErrors({});
        setNotice('Prospect updated. Review it again before approving.');
        await reloadDetail(detail.prospect.id);
        router.refresh();
        return;
      }
      if (action === 'approve') {
        setNotice(
          `Approved. A CRM lead was created${
            result.lead?.companyName ? ` for ${result.lead.companyName}` : ''
          }.`,
        );
      } else if (action === 'reject') {
        setNotice('Prospect rejected. It stays in the archive for reference.');
      } else if (action === 'request_research') {
        setNotice(
          `Research requested${
            result.researchJob?.id ? ` (job ${result.researchJob.id.slice(0, 8)})` : ''
          }. It runs in the background worker.`,
        );
      } else if (action === 'mark_duplicate') {
        setNotice('Marked as a duplicate. No lead was created.');
      }
      setSelectedId(null);
      setDetail(null);
      router.refresh();
    } catch (err) {
      if (err.code === 'POSSIBLE_DUPLICATE_LEAD' && err.details?.matches) {
        setError(
          `${err.message} Matches: ${err.details.matches
            .map((match) => match.companyName)
            .join(', ')}.`,
        );
      } else if (err.code === 'VALIDATION_FAILED' && err.details) {
        setEditErrors(err.details);
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(null);
    }
  }

  function startEdit() {
    if (!detail) return;
    setEditing(true);
    setEditValues(editValuesFrom(detail.prospect));
    setEditErrors({});
    clearMessages();
  }

  async function saveEdit() {
    if (!editValues) return;
    await review('edit', {
      values: {
        ...editValues,
        leadScore: editValues.leadScore === '' ? null : Number(editValues.leadScore),
        confidence:
          editValues.confidence === '' ? null : Number(editValues.confidence),
        qualificationQuestions: editValues.qualificationQuestions
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      },
    });
  }

  function setEditField(field, value) {
    setEditValues((current) => ({ ...current, [field]: value }));
  }

  const prospect = detail?.prospect || null;
  const duplicates = detail?.possibleDuplicates || [];
  const canApprove = prospect && prospect.status === 'pending_review' && duplicates.length === 0;

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/discovery">AI discovery</Link> / Review queue
        </Eyebrow>
        <Title>Prospect review</Title>
        <Lead>
          Approve only verified businesses you want in the CRM. AI scores and
          recommendations are labelled hypotheses until a person approves them.
        </Lead>
      </Header>

      {error ? (
        <Notice $tone="danger">
          <XCircle size={16} />
          <span>{error}</span>
        </Notice>
      ) : null}
      {notice ? (
        <Notice $tone="success">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </Notice>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Queue</CardTitle>
            <CardText>
              {formatCount(prospects.total)} prospects · page {prospects.page} of{' '}
              {prospects.pages}
            </CardText>
          </div>
        </CardHead>

        <FilterBar action="/workspace/discovery/review" method="get">
          <FilterField>
            Status
            <select name="status" defaultValue={query.status || 'pending_review'}>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            Temperature
            <select name="temperature" defaultValue={query.temperature || ''}>
              {TEMPERATURE_OPTIONS.map(([value, label]) => (
                <option key={value || 'any'} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            Campaign
            <select name="campaignId" defaultValue={query.campaignId || ''}>
              <option value="">All campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            Search
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Business, city, phone"
            />
          </FilterField>
          <Button type="submit">Filter</Button>
          <LinkButton href="/workspace/discovery/review">Reset</LinkButton>
        </FilterBar>

        {prospects.items.length === 0 ? (
          <EmptyState>
            <FileSearch size={20} />
            <div>
              <h3>Nothing in this queue</h3>
              <p>
                New candidates appear here after a discovery run. Adjust the filters
                to see other statuses.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TwoCol>
            {prospects.items.map((item) => {
              const status = metaFor(PROSPECT_STATUS_META, item.status);
              const temp = metaFor(TEMPERATURE_META, item.temperature);
              const active = selectedId === item.id;
              return (
                <Card key={item.id}>
                  <CardHead>
                    <div>
                      <CardTitle>{item.businessName}</CardTitle>
                      <CardText>
                        {item.campaignName || 'Campaign'} ·{' '}
                        {[item.city, item.country].filter(Boolean).join(', ') ||
                          'No location'}
                      </CardText>
                    </div>
                    <Badge $tone={status.tone}>{status.label}</Badge>
                  </CardHead>
                  <Row>
                    <Badge $tone={temp.tone}>{temp.label}</Badge>
                    {item.leadScore != null ? (
                      <Badge $tone="info">Score {item.leadScore}</Badge>
                    ) : null}
                    {item.confidence != null ? (
                      <Badge $tone="muted">Confidence {item.confidence}%</Badge>
                    ) : null}
                  </Row>
                  {item.reason ? <CardText>{truncate(item.reason, 180)}</CardText> : null}
                  <Actions>
                    <Button onClick={() => selectProspect(item.id)} disabled={loadingDetail}>
                      {active ? 'Hide details' : 'Review'}
                    </Button>
                    {item.leadId ? (
                      <LinkButton href={`/workspace/leads/${item.leadId}`}>
                        Open lead
                      </LinkButton>
                    ) : null}
                  </Actions>
                </Card>
              );
            })}
          </TwoCol>
        )}

        <ListPager
          page={prospects.page}
          pages={prospects.pages}
          total={prospects.total}
          pageSize={prospects.pageSize}
          hrefFor={(page) => hrefFor(query, page)}
        />
      </Card>

      {loadingDetail ? (
        <Notice>
          <Loader2 size={16} />
          <span>Loading prospect detail…</span>
        </Notice>
      ) : null}

      {detail && prospect ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>{prospect.businessName}</CardTitle>
              <CardText>
                {prospect.campaignName || 'Campaign'} · discovered{' '}
                {formatDateTime(prospect.discoveryDate, timezone)}
              </CardText>
            </div>
            <Badge $tone={metaFor(PROSPECT_STATUS_META, prospect.status).tone}>
              {metaFor(PROSPECT_STATUS_META, prospect.status).label}
            </Badge>
          </CardHead>

          <MetaGrid>
            <div>
              <dt>Website</dt>
              <dd>{prospect.website || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{prospect.phone || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{prospect.email || '—'}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>{prospect.contactName || '—'}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{prospect.address || '—'}</dd>
            </div>
            <div>
              <dt>Industry</dt>
              <dd>{prospect.industry || '—'}</dd>
            </div>
            <div>
              <dt>Business size</dt>
              <dd>{prospect.businessSize || '—'}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{prospect.provider}</dd>
            </div>
            <div>
              <dt>Verification</dt>
              <dd>
                <Badge $tone={metaFor(VERIFICATION_META, prospect.verificationStatus).tone}>
                  {metaFor(VERIFICATION_META, prospect.verificationStatus).label}
                </Badge>
              </dd>
            </div>
            {prospect.sourceUrls?.length ? (
              <div>
                <dt>Sources</dt>
                <dd>
                  {prospect.sourceUrls.map((url) => (
                    <div key={url}>
                      <a href={url} target="_blank" rel="noreferrer noopener">
                        {url}
                      </a>
                    </div>
                  ))}
                </dd>
              </div>
            ) : null}
          </MetaGrid>

          {Object.keys(prospect.facts || {}).length > 0 ? (
            <div>
              <CardTitle>Recorded facts</CardTitle>
              <MetaGrid>
                {Object.entries(prospect.facts).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {Array.isArray(value)
                        ? value.join(', ')
                        : typeof value === 'object' && value !== null
                          ? JSON.stringify(value)
                          : String(value ?? '—')}
                    </dd>
                  </div>
                ))}
              </MetaGrid>
            </div>
          ) : null}

          {Object.keys(prospect.observations || {}).length > 0 ? (
            <div>
              <CardTitle>Source observations</CardTitle>
              <MetaGrid>
                {Object.entries(prospect.observations).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </MetaGrid>
            </div>
          ) : null}

          <Grid $cols={2}>
            <div>
              <CardTitle>AI recommendation</CardTitle>
              <CardText>
                Score {prospect.leadScore ?? '—'} · Confidence{' '}
                {prospect.confidence != null ? `${prospect.confidence}%` : '—'} ·{' '}
                {metaFor(TEMPERATURE_META, prospect.temperature).label}
              </CardText>
              <MetaGrid>
                <div>
                  <dt>Suggested service</dt>
                  <dd>{prospect.recommendedService || '—'}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{prospect.reason || '—'}</dd>
                </div>
                <div>
                  <dt>Pitch</dt>
                  <dd>{prospect.pitch || '—'}</dd>
                </div>
                <div>
                  <dt>Calling approach</dt>
                  <dd>{prospect.callingApproach || '—'}</dd>
                </div>
                <div>
                  <dt>Next action</dt>
                  <dd>{prospect.nextAction || '—'}</dd>
                </div>
              </MetaGrid>
              {prospect.qualificationQuestions?.length ? (
                <div>
                  <CardTitle>Qualification questions</CardTitle>
                  <ol>
                    {prospect.qualificationQuestions.map((question) => (
                      <li key={question}>
                        <CardText>{question}</CardText>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>

            <div>
              <CardTitle>Hypotheses (not verified)</CardTitle>
              {(prospect.hypotheses || []).length === 0 ? (
                <CardText>
                  No AI hypotheses were recorded. The prospect was captured from the
                  source only.
                </CardText>
              ) : (
                <div>
                  {prospect.hypotheses.map((item, index) => (
                    <CardText key={`${item.statement}-${index}`}>
                      {item.statement}
                      {item.confidence != null ? ` (confidence ${item.confidence}%)` : ''}
                    </CardText>
                  ))}
                </div>
              )}
              {prospect.research ? (
                <Notice>
                  <FileSearch size={16} />
                  <span>
                    Research requested
                    {prospect.research.requestedAt
                      ? ` on ${formatDateTime(prospect.research.requestedAt, timezone)}`
                      : ''}
                    {prospect.research.researchJobId
                      ? ` · job ${prospect.research.researchJobId.slice(0, 8)}`
                      : ''}
                    .
                  </span>
                </Notice>
              ) : null}
            </div>
          </Grid>

          {duplicates.length > 0 ? (
            <Notice $tone="warning">
              <Copy size={16} />
              <span>
                Possible duplicates found:{' '}
                {duplicates.map((match, index) => (
                  <span key={match.id}>
                    {index > 0 ? ', ' : ''}
                    <Link href={`/workspace/leads/${match.id}`}>{match.companyName}</Link>
                    {match.reasons?.length
                      ? ` (${match.reasons.map(friendlyReason).join(', ')})`
                      : ''}
                  </span>
                ))}
                . Approval is blocked until you mark this prospect as a duplicate or
                edit it so it no longer matches.
              </span>
            </Notice>
          ) : null}

          {detail.linkedLead ? (
            <Notice $tone="success">
              <ExternalLink size={16} />
              <span>
                Linked lead:{' '}
                <Link href={`/workspace/leads/${detail.linkedLead.id}`}>
                  {detail.linkedLead.companyName}
                </Link>{' '}
                ({detail.linkedLead.status}).
              </span>
            </Notice>
          ) : null}

          {prospect.status === 'pending_review' && canReview ? (
            <>
              <Field>
                <Label htmlFor="review-note">Decision note (optional)</Label>
                <Textarea
                  id="review-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Why this decision was made, or what research to run."
                  maxLength={2000}
                />
              </Field>

              {editing && editValues ? (
                <div>
                  <CardTitle>Edit prospect</CardTitle>
                  <Grid $cols={2}>
                    {EDIT_FIELDS.map(([field, label]) => (
                      <Field key={field}>
                        <Label htmlFor={`edit-${field}`}>{label}</Label>
                        <Input
                          id={`edit-${field}`}
                          value={editValues[field]}
                          onChange={(event) => setEditField(field, event.target.value)}
                          disabled={busy === 'edit'}
                        />
                        {editErrors[field] ? (
                          <ErrorText>{editErrors[field]}</ErrorText>
                        ) : null}
                      </Field>
                    ))}
                    <Field>
                      <Label htmlFor="edit-temperature">Temperature</Label>
                      <Select
                        id="edit-temperature"
                        value={editValues.temperature}
                        onChange={(event) =>
                          setEditField('temperature', event.target.value)
                        }
                      >
                        {Object.entries(TEMPERATURE_META).map(([key, meta]) => (
                          <option key={key} value={key}>
                            {meta.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="edit-next-action">Next action</Label>
                      <Input
                        id="edit-next-action"
                        value={editValues.nextAction}
                        onChange={(event) => setEditField('nextAction', event.target.value)}
                      />
                    </Field>
                  </Grid>
                  <Field>
                    <Label htmlFor="edit-reason">Reason</Label>
                    <Textarea
                      id="edit-reason"
                      value={editValues.reason}
                      onChange={(event) => setEditField('reason', event.target.value)}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="edit-pitch">Pitch</Label>
                    <Textarea
                      id="edit-pitch"
                      value={editValues.pitch}
                      onChange={(event) => setEditField('pitch', event.target.value)}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="edit-approach">Calling approach</Label>
                    <Textarea
                      id="edit-approach"
                      value={editValues.callingApproach}
                      onChange={(event) =>
                        setEditField('callingApproach', event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="edit-questions">Qualification questions (one per line)</Label>
                    <Textarea
                      id="edit-questions"
                      value={editValues.qualificationQuestions}
                      onChange={(event) =>
                        setEditField('qualificationQuestions', event.target.value)
                      }
                    />
                  </Field>
                  <Actions>
                    <Button
                      $variant="primary"
                      onClick={saveEdit}
                      disabled={Boolean(busy)}
                    >
                      {busy === 'edit' ? <Loader2 size={16} /> : <Pencil size={16} />}
                      Save changes
                    </Button>
                    <Button
                      $variant="ghost"
                      onClick={() => setEditing(false)}
                      disabled={Boolean(busy)}
                    >
                      Discard
                    </Button>
                  </Actions>
                </div>
              ) : (
                <>
                  <Row>
                    <Field>
                      <Label htmlFor="review-assignee">Assign new lead to</Label>
                      <Select
                        id="review-assignee"
                        value={assignedUserId}
                        onChange={(event) => setAssignedUserId(event.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {members.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name || member.email} · {member.role}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </Row>
                  <Actions>
                    <Button
                      $variant="primary"
                      disabled={Boolean(busy) || !canApprove}
                      onClick={() =>
                        review('approve', {
                          assignedUserId: assignedUserId || null,
                        })
                      }
                    >
                      {busy === 'approve' ? <Loader2 size={16} /> : <CheckCircle2 size={16} />}
                      Approve and create lead
                    </Button>
                    <Button
                      disabled={Boolean(busy)}
                      onClick={() => review('request_research')}
                    >
                      {busy === 'request_research' ? (
                        <Loader2 size={16} />
                      ) : (
                        <FileSearch size={16} />
                      )}
                      Request research
                    </Button>
                    <Button
                      disabled={Boolean(busy)}
                      onClick={startEdit}
                    >
                      <Pencil size={16} /> Edit
                    </Button>
                    <Button
                      disabled={Boolean(busy)}
                      onClick={() =>
                        review('mark_duplicate', {
                          duplicateLeadId: duplicateLeadId || duplicates[0]?.id || null,
                        })
                      }
                    >
                      {busy === 'mark_duplicate' ? (
                        <Loader2 size={16} />
                      ) : (
                        <Copy size={16} />
                      )}
                      Mark duplicate
                    </Button>
                    <Button
                      $variant="danger"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Reject this prospect? It stays in the archive but no lead is created.',
                          )
                        ) {
                          review('reject');
                        }
                      }}
                    >
                      {busy === 'reject' ? <Loader2 size={16} /> : <XCircle size={16} />}
                      Reject
                    </Button>
                  </Actions>
                  {duplicates.length > 0 ? (
                    <Field>
                      <Label htmlFor="review-duplicate">Link duplicate to lead</Label>
                      <Select
                        id="review-duplicate"
                        value={duplicateLeadId}
                        onChange={(event) => setDuplicateLeadId(event.target.value)}
                      >
                        <option value="">No link</option>
                        {duplicates.map((match) => (
                          <option key={match.id} value={match.id}>
                            {match.companyName}
                          </option>
                        ))}
                      </Select>
                      <Hint>Links are recorded for traceability only.</Hint>
                    </Field>
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </Card>
      ) : null}
    </Page>
  );
}
