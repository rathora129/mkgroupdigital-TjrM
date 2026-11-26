'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BadgeCheck,
  CircleAlert,
  ClipboardList,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
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
  EmptyState,
  ErrorText,
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
  Stack,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Textarea,
  Title,
  Eyebrow,
  Divider,
} from '@/components/workspace/ai/primitives';
import { computeProposal } from '@/lib/proposals/calc';
import {
  BILLING_TYPE_LABELS,
  DISCOUNT_TYPE_LABELS,
  ITEM_KIND_LABELS,
  PROPOSAL_ACTIVITY_LABELS,
  SECTION_GROUPS,
  SECTION_LABELS,
  TAX_SCHEME_LABELS,
  bpsFromPercent,
  formatMoney,
  percentInput,
  statusMeta,
  toMajorInput,
  toMinorInput,
} from './meta';

const RECURRING = new Set(['monthly', 'quarterly', 'annual']);

const LineCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid #e5eaf1;
  background: #ffffff;
`;

const LineHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const MiniGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
`;

const TabBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const TabButton = styled.button`
  padding: 7px 13px;
  border-radius: 999px;
  border: 1px solid ${({ $active }) => ($active ? '#1d4ed8' : '#dbe3ed')};
  background: ${({ $active }) => ($active ? '#eff5ff' : '#ffffff')};
  color: ${({ $active }) => ($active ? '#1d4ed8' : '#475569')};
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
`;

const TotalsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
`;

const TotalBox = styled.div`
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e5eaf1;
  background: #f8fafc;

  span {
    display: block;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #64748b;
  }

  strong {
    display: block;
    margin-top: 4px;
    font-size: 1rem;
    color: #0f172a;
  }
`;

const PreviewSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 6px;

  h4 {
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #475569;
  }

  p {
    margin: 0;
    white-space: pre-wrap;
    font-size: 0.85rem;
    line-height: 1.7;
    color: #334155;
  }
`;

function dateInput(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function isoDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}

function toCalcItem(item) {
  return {
    key: item.key,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    discountType: item.discountType,
    discountValue: item.discountValue,
    taxScheme: item.taxScheme,
    taxRateBps: item.taxRateBps,
    billingType: item.billingType,
    kind: item.kind,
  };
}

function localItems(detail) {
  return detail.items.map((item) => ({ ...item, key: item.id }));
}

function emptyItem() {
  return {
    key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    serviceId: null,
    name: '',
    description: '',
    scope: '',
    quantity: 1,
    unit: 'unit',
    unitPriceCents: 0,
    discountType: 'none',
    discountValue: 0,
    taxScheme: 'none',
    taxRateBps: 0,
    billingType: 'one_time',
    startCondition: '',
    billingNotes: '',
    minimumCommitmentMonths: null,
    kind: 'included',
  };
}

function localDeliverable(entry, index) {
  return {
    key: entry?.id || `new-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    serviceId: entry?.serviceId || null,
    title: entry?.title || '',
    description: entry?.description || '',
    expectedCompletion: entry?.expectedCompletion || '',
  };
}

export default function ProposalDetailView({
  detail,
  services,
  owners,
  timezone,
  permissions,
  canRunAi,
}) {
  const router = useRouter();
  const version = detail.currentVersion;
  const editable = version.isEditable && permissions.canEdit;
  const status = statusMeta(version.displayStatus);

  const [tab, setTab] = useState('pricing');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [success, setSuccess] = useState(null);

  const [title, setTitle] = useState(detail.proposal.title);
  const [ownerUserId, setOwnerUserId] = useState(detail.proposal.salesOwnerUserId || '');
  const [currency, setCurrency] = useState(version.currency);
  const [validityDate, setValidityDate] = useState(dateInput(version.validityDate));
  const [discountType, setDiscountType] = useState(version.proposalDiscountType);
  const [discountValue, setDiscountValue] = useState(version.proposalDiscountValue);
  const [changeSummary, setChangeSummary] = useState('');
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(version.updatedAt);
  const [items, setItems] = useState(() => localItems(detail));
  const [sections, setSections] = useState(() => ({ ...detail.sections }));
  const [deliverables, setDeliverables] = useState(() =>
    detail.deliverables.map((entry, index) => localDeliverable(entry, index)),
  );
  const [milestones, setMilestones] = useState(() =>
    detail.milestones.map((entry, index) => localDeliverable(entry, index)),
  );
  const [cataloguePick, setCataloguePick] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [responseNotes, setResponseNotes] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiResult, setAiResult] = useState(null);

  const calc = useMemo(
    () =>
      computeProposal({
        items: items.map(toCalcItem),
        proposalDiscountType: discountType,
        proposalDiscountValue: discountValue,
      }),
    [items, discountType, discountValue],
  );

  function applyResult(result, message) {
    setFailure(null);
    if (message) setSuccess(message);
    if (result?.currentVersion) {
      setExpectedUpdatedAt(result.currentVersion.updatedAt);
    }
    router.refresh();
  }

  async function run(action, message) {
    setBusy(true);
    setFailure(null);
    setSuccess(null);
    try {
      const result = await action();
      applyResult(result, message);
      return result;
    } catch (error) {
      setFailure(error.message);
      if (error.details) {
        const first = Object.values(error.details)[0];
        if (first) setFailure(`${error.message} ${first}`);
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  function updateItem(key, patch) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function addCatalogueLine(serviceId) {
    const service = services.find((entry) => entry.id === serviceId);
    if (!service) return;
    setItems((current) => [
      ...current,
      {
        ...emptyItem(),
        serviceId: service.id,
        name: service.name,
        description: service.categoryName ? `Catalogue: ${service.categoryName}` : '',
      },
    ]);
    setCataloguePick('');
  }

  function moveItem(index, direction) {
    setItems((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function saveDraft() {
    const cleanItems = items
      .filter((item) => item.name.trim().length > 0)
      .map((item) => ({
        serviceId: item.serviceId || null,
        name: item.name.trim(),
        description: item.description || null,
        scope: item.scope || null,
        quantity: Number(item.quantity) || 1,
        unit: item.unit || 'unit',
        unitPriceCents: Number(item.unitPriceCents) || 0,
        discountType: item.discountType,
        discountValue: Number(item.discountValue) || 0,
        taxScheme: item.taxScheme,
        taxRateBps: Number(item.taxRateBps) || 0,
        billingType: item.billingType,
        startCondition: item.startCondition || null,
        billingNotes: item.billingNotes || null,
        minimumCommitmentMonths:
          item.minimumCommitmentMonths === '' || item.minimumCommitmentMonths == null
            ? null
            : Number(item.minimumCommitmentMonths),
        kind: item.kind,
      }));
    if (cleanItems.length === 0) {
      setFailure('Add at least one complete line item before saving.');
      return;
    }

    run(
      () =>
        apiRequest(`/api/workforce/proposals/${detail.proposal.id}/content`, {
          method: 'PUT',
          body: {
            expectedUpdatedAt: new Date(expectedUpdatedAt).toISOString(),
            changeSummary: changeSummary || null,
            currency,
            validityDate: isoDate(validityDate),
            proposalDiscountType: discountType,
            proposalDiscountValue: Number(discountValue) || 0,
            items: cleanItems,
            sections,
            deliverables: deliverables
              .filter((entry) => entry.title.trim())
              .map((entry) => ({
                serviceId: entry.serviceId || null,
                title: entry.title.trim(),
                description: entry.description || null,
                expectedCompletion: entry.expectedCompletion || null,
              })),
            milestones: milestones
              .filter((entry) => entry.title.trim())
              .map((entry) => ({
                serviceId: entry.serviceId || null,
                title: entry.title.trim(),
                description: entry.description || null,
                expectedCompletion: entry.expectedCompletion || null,
              })),
          },
        }),
      'Draft saved.',
    ).then((result) => {
      if (result) setChangeSummary('');
    });
  }

  function saveDetails() {
    run(
      () =>
        apiRequest(`/api/workforce/proposals/${detail.proposal.id}`, {
          method: 'PATCH',
          body: {
            title: title.trim(),
            salesOwnerUserId: ownerUserId || null,
          },
        }),
      'Proposal details saved.',
    );
  }

  function submitForReview() {
    run(
      () =>
        apiRequest(`/api/workforce/proposals/${detail.proposal.id}/submit`, {
          method: 'POST',
        }),
      'Submitted for internal review.',
    );
  }

  function decide(decision) {
    if (decision === 'changes_requested' && !approvalNotes.trim()) {
      setFailure('Add a note explaining the requested changes.');
      return;
    }
    run(
      () =>
        apiRequest(`/api/workforce/proposals/${detail.proposal.id}/decision`, {
          method: 'POST',
          body: { decision, notes: approvalNotes.trim() || null },
        }),
      decision === 'approved' ? 'Version approved.' : 'Changes requested.',
    ).then((result) => {
      if (result) setApprovalNotes('');
    });
  }

  function markSent() {
    if (!window.confirm('Mark this approved version as sent to the client? No email is sent automatically.')) {
      return;
    }
    run(
      () =>
        apiRequest(`/api/workforce/proposals/${detail.proposal.id}/send`, {
          method: 'POST',
        }),
      'Version marked as sent.',
    );
  }

  function recordResponse(response) {
    if (!window.confirm(`Record that the client ${response} this proposal?`)) return;
    run(
      () =>
        apiRequest(`/api/workforce/proposals/${detail.proposal.id}/response`, {
          method: 'POST',
          body: { response, notes: responseNotes.trim() || null },
        }),
      `Client ${response} recorded. The opportunity stage is unchanged.`,
    ).then((result) => {
      if (result) setResponseNotes('');
    });
  }

  function createRevision() {
    if (!window.confirm('Create a new draft revision from this version? The current version stays unchanged.')) {
      return;
    }
    run(
      () =>
        apiRequest(`/api/workforce/proposals/${detail.proposal.id}/versions`, {
          method: 'POST',
          body: { changeSummary: revisionNote.trim() || null },
        }),
      'Revision created as a new draft.',
    ).then((result) => {
      if (result) setRevisionNote('');
    });
  }

  function requestAi() {
    run(
      () =>
        apiRequest(`/api/workforce/proposals/${detail.proposal.id}/ai-draft`, {
          method: 'POST',
          body: { instruction: aiInstruction.trim() || null },
        }),
      'AI draft requested. It runs in the background and needs human review.',
    ).then((result) => {
      if (result) setAiResult(result);
    });
  }

  const currencyValue = currency || 'INR';

  return (
    <Page>
      <Row>
        <Link href="/workspace/proposals" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> All proposals
        </Link>
      </Row>

      <Header>
        <Eyebrow>{detail.proposal.reference}</Eyebrow>
        <Title>{detail.proposal.title}</Title>
        <Lead>
          {detail.proposal.companyName || 'Client not recorded'} ·{' '}
          {detail.proposal.contactName || 'No contact'} · Opportunity{' '}
          <Link href={`/workspace/opportunities/${detail.proposal.opportunityId}`}>
            {detail.proposal.opportunityTitle}
          </Link>
        </Lead>
        <Row>
          <Badge $tone={status.tone}>{status.label}</Badge>
          <Badge $tone="muted">Version {version.versionNumber}</Badge>
          {version.isExpired ? <Badge $tone="warning">Validity elapsed</Badge> : null}
          <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
            Valid until {formatDate(version.validityDate, timezone)} · Owner{' '}
            {detail.proposal.salesOwnerName || detail.proposal.salesOwnerEmail || 'Unassigned'}
          </span>
        </Row>
      </Header>

      {success ? (
        <Notice $tone="success">
          <BadgeCheck size={15} />
          {success}
        </Notice>
      ) : null}
      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          {failure}
        </Notice>
      ) : null}
      {version.displayStatus === 'expired' ? (
        <Notice $tone="warning">
          <CircleAlert size={15} />
          The validity date has passed. The stored version is unchanged; create a
          revision to issue new terms.
        </Notice>
      ) : null}

      <StatGrid>
        <StatCard>
          <StatLabel>One-time total</StatLabel>
          <StatValue>{formatMoney(calc.totals.oneTimeTotalCents, currencyValue)}</StatValue>
          <StatNote>Included one-time services, including tax</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Monthly recurring</StatLabel>
          <StatValue>{formatMoney(calc.totals.recurringMonthlyCents, currencyValue)}</StatValue>
          <StatNote>Shown separately, never added to the one-time total</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Quarterly / annual</StatLabel>
          <StatValue>
            {formatMoney(calc.totals.recurringQuarterlyCents, currencyValue)} /{' '}
            {formatMoney(calc.totals.recurringAnnualCents, currencyValue)}
          </StatValue>
          <StatNote>Each billing frequency is separate</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Optional add-ons</StatLabel>
          <StatValue>{formatMoney(calc.totals.optionalTotalCents, currencyValue)}</StatValue>
          <StatNote>Not included in any contract total</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Workflow</CardTitle>
            <CardText>
              Only drafts are editable. Approved versions are immutable; further
              changes require a new revision. Sending is manual and never
              automatic.
            </CardText>
          </div>
          <Actions>
            {editable ? (
              <Button type="button" $variant="primary" disabled={busy} onClick={saveDraft}>
                {busy ? <Loader2 size={15} /> : <BadgeCheck size={15} />}
                Save draft
              </Button>
            ) : null}
            {permissions.canSubmit && version.status === 'draft' ? (
              <Button type="button" disabled={busy} onClick={submitForReview}>
                <ClipboardList size={15} />
                Submit for review
              </Button>
            ) : null}
            {permissions.canSend && version.status === 'approved' ? (
              <Button type="button" disabled={busy} onClick={markSent}>
                <Send size={15} />
                Mark as sent
              </Button>
            ) : null}
            {permissions.canExport ? (
              <LinkButton href={`/workspace/proposals/${detail.proposal.id}/preview`} target="_blank">
                <Printer size={15} />
                Preview &amp; print
              </LinkButton>
            ) : null}
            {permissions.canNewVersion && version.status !== 'draft' ? (
              <Button type="button" $variant="ghost" disabled={busy} onClick={createRevision}>
                <RefreshCw size={15} />
                New revision
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {version.status === 'internal_review' ? (
          <Stack $gap={10}>
            <Field>
              <Label>Review notes</Label>
              <Textarea
                rows={2}
                value={approvalNotes}
                onChange={(event) => setApprovalNotes(event.target.value)}
                placeholder="Record what changed, or what needs to change before approval."
              />
            </Field>
            <Actions>
              {permissions.canApprove ? (
                <Button type="button" $variant="primary" disabled={busy} onClick={() => decide('approved')}>
                  <BadgeCheck size={15} />
                  Approve version
                </Button>
              ) : null}
              {permissions.canReject ? (
                <Button type="button" disabled={busy} onClick={() => decide('changes_requested')}>
                  Request changes
                </Button>
              ) : null}
            </Actions>
          </Stack>
        ) : null}

        {version.status === 'sent' && permissions.canRespond ? (
          <Stack $gap={10}>
            <Field>
              <Label>Client response notes</Label>
              <Textarea
                rows={2}
                value={responseNotes}
                onChange={(event) => setResponseNotes(event.target.value)}
                placeholder="How the client responded, and any follow-up."
              />
            </Field>
            <Hint>
              Recording a response updates this proposal only. Update the
              opportunity stage yourself if it has moved on.
            </Hint>
            <Actions>
              <Button type="button" $variant="primary" disabled={busy} onClick={() => recordResponse('accepted')}>
                Mark accepted
              </Button>
              <Button type="button" disabled={busy} onClick={() => recordResponse('rejected')}>
                Mark rejected
              </Button>
            </Actions>
          </Stack>
        ) : null}

        {permissions.canNewVersion && version.status !== 'draft' ? (
          <Field>
            <Label>Revision note</Label>
            <Input
              value={revisionNote}
              onChange={(event) => setRevisionNote(event.target.value)}
              placeholder="What changes in the next version?"
              maxLength={500}
            />
          </Field>
        ) : null}

        {canRunAi && version.status === 'draft' ? (
          <CardHead style={{ marginTop: 8 }}>
            <div>
              <CardTitle>AI drafting assistant</CardTitle>
              <CardText>
                Requests a background AI draft from saved records. AI cannot
                approve, send, invent prices or accept on the client&apos;s
                behalf.
              </CardText>
            </div>
            <Actions>
              <Input
                value={aiInstruction}
                onChange={(event) => setAiInstruction(event.target.value)}
                placeholder="Optional instruction"
                maxLength={1000}
                style={{ minWidth: 220 }}
              />
              <Button type="button" $variant="ghost" disabled={busy} onClick={requestAi}>
                <Sparkles size={15} />
                Request AI draft
              </Button>
            </Actions>
          </CardHead>
        ) : null}
        {aiResult ? (
          <Notice $tone="info">
            <Sparkles size={15} />
            Run {aiResult.run.id.slice(0, 8)} queued for {aiResult.agent.name}. Review the
            output in AI Workforce before copying anything into this proposal.
          </Notice>
        ) : null}

        {editable ? (
          <>
            <Divider />
            <Grid $cols={3}>
              <Field>
                <Label>Title</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
              </Field>
              <Field>
                <Label>Sales owner</Label>
                <Select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {owners.map((owner) => (
                    <option key={owner.userId} value={owner.userId}>
                      {owner.name || owner.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Change summary</Label>
                <Input
                  value={changeSummary}
                  onChange={(event) => setChangeSummary(event.target.value)}
                  placeholder="Optional note for this save"
                  maxLength={500}
                />
              </Field>
              <Field>
                <Label>Currency</Label>
                <Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} />
              </Field>
              <Field>
                <Label>Valid until</Label>
                <Input type="date" value={validityDate} onChange={(event) => setValidityDate(event.target.value)} />
              </Field>
              <Field>
                <Label>&nbsp;</Label>
                <Button type="button" disabled={busy} onClick={saveDetails}>
                  Save details
                </Button>
              </Field>
            </Grid>
          </>
        ) : null}
      </Card>

      <TabBar>
        {[
          ['pricing', 'Services & pricing'],
          ['scope', 'Scope & deliverables'],
          ['terms', 'Terms'],
          ['preview', 'Preview'],
          ['history', 'Versions & activity'],
        ].map(([key, label]) => (
          <TabButton key={key} type="button" $active={tab === key} onClick={() => setTab(key)}>
            {label}
          </TabButton>
        ))}
      </TabBar>

      {tab === 'pricing' ? (
        <Stack $gap={14}>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Line items</CardTitle>
                <CardText>
                  Add catalogue or custom services. Prices always start at zero
                  because the catalogue stores no prices.
                </CardText>
              </div>
              {editable ? (
                <Actions>
                  <Select value={cataloguePick} onChange={(event) => addCatalogueLine(event.target.value)}>
                    <option value="">Add from catalogue…</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    $variant="ghost"
                    onClick={() => setItems((current) => [...current, emptyItem()])}
                  >
                    <Plus size={15} />
                    Custom line
                  </Button>
                </Actions>
              ) : null}
            </CardHead>

            {items.length === 0 ? (
              <EmptyState>
                <ClipboardList size={17} />
                <div>
                  <h3>No line items yet</h3>
                  <p>Add a catalogue service or a custom line to begin pricing.</p>
                </div>
              </EmptyState>
            ) : (
              <Stack $gap={10}>
                {items.map((item, index) => (
                  <LineCard key={item.key}>
                    <LineHead>
                      <Input
                        value={item.name}
                        onChange={(event) => updateItem(item.key, { name: event.target.value })}
                        placeholder="Line name"
                        maxLength={200}
                        disabled={!editable}
                        style={{ flex: '1 1 220px' }}
                      />
                      <Select
                        value={item.kind}
                        onChange={(event) => updateItem(item.key, { kind: event.target.value })}
                        disabled={!editable}
                      >
                        {Object.entries(ITEM_KIND_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      {editable ? (
                        <Actions>
                          <Button type="button" $variant="ghost" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                            <ArrowUp size={14} />
                          </Button>
                          <Button type="button" $variant="ghost" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}>
                            <ArrowDown size={14} />
                          </Button>
                          <Button
                            type="button"
                            $variant="ghost"
                            onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </Actions>
                      ) : null}
                    </LineHead>

                    <MiniGrid>
                      <Field>
                        <Label>Catalogue service</Label>
                        <Select
                          value={item.serviceId || ''}
                          onChange={(event) => {
                            const service = services.find((entry) => entry.id === event.target.value);
                            updateItem(item.key, {
                              serviceId: event.target.value || null,
                              name: item.name || service?.name || '',
                            });
                          }}
                          disabled={!editable}
                        >
                          <option value="">Custom line</option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field>
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                          disabled={!editable}
                        />
                      </Field>
                      <Field>
                        <Label>Unit</Label>
                        <Input
                          value={item.unit}
                          onChange={(event) => updateItem(item.key, { unit: event.target.value })}
                          maxLength={40}
                          disabled={!editable}
                        />
                      </Field>
                      <Field>
                        <Label>Unit price ({currencyValue})</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={toMajorInput(item.unitPriceCents)}
                          onChange={(event) =>
                            updateItem(item.key, { unitPriceCents: toMinorInput(event.target.value) })
                          }
                          disabled={!editable}
                        />
                      </Field>
                      <Field>
                        <Label>Discount type</Label>
                        <Select
                          value={item.discountType}
                          onChange={(event) =>
                            updateItem(item.key, {
                              discountType: event.target.value,
                              discountValue: 0,
                            })
                          }
                          disabled={!editable}
                        >
                          {Object.entries(DISCOUNT_TYPE_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field>
                        <Label>
                          Discount {item.discountType === 'percent' ? '(%)' : `(${currencyValue})`}
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            item.discountType === 'percent'
                              ? percentInput(item.discountValue)
                              : toMajorInput(item.discountValue)
                          }
                          onChange={(event) =>
                            updateItem(item.key, {
                              discountValue:
                                item.discountType === 'percent'
                                  ? bpsFromPercent(event.target.value)
                                  : toMinorInput(event.target.value),
                            })
                          }
                          disabled={!editable || item.discountType === 'none'}
                        />
                      </Field>
                      <Field>
                        <Label>Tax treatment</Label>
                        <Select
                          value={item.taxScheme}
                          onChange={(event) =>
                            updateItem(item.key, {
                              taxScheme: event.target.value,
                              taxRateBps: event.target.value === 'none' ? 0 : item.taxRateBps,
                            })
                          }
                          disabled={!editable}
                        >
                          {Object.entries(TAX_SCHEME_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field>
                        <Label>Tax rate (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={percentInput(item.taxRateBps)}
                          onChange={(event) =>
                            updateItem(item.key, { taxRateBps: bpsFromPercent(event.target.value) })
                          }
                          disabled={!editable || item.taxScheme === 'none'}
                        />
                      </Field>
                      <Field>
                        <Label>Billing</Label>
                        <Select
                          value={item.billingType}
                          onChange={(event) => updateItem(item.key, { billingType: event.target.value })}
                          disabled={!editable}
                        >
                          {Object.entries(BILLING_TYPE_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field>
                        <Label>Minimum commitment (months)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="120"
                          value={item.minimumCommitmentMonths ?? ''}
                          onChange={(event) =>
                            updateItem(item.key, { minimumCommitmentMonths: event.target.value })
                          }
                          disabled={!editable || !RECURRING.has(item.billingType)}
                        />
                      </Field>
                    </MiniGrid>

                    <Grid $cols={2}>
                      <Field>
                        <Label>Description</Label>
                        <Textarea
                          rows={2}
                          value={item.description || ''}
                          onChange={(event) => updateItem(item.key, { description: event.target.value })}
                          disabled={!editable}
                        />
                      </Field>
                      <Field>
                        <Label>Scope</Label>
                        <Textarea
                          rows={2}
                          value={item.scope || ''}
                          onChange={(event) => updateItem(item.key, { scope: event.target.value })}
                          disabled={!editable}
                        />
                      </Field>
                      <Field>
                        <Label>Start condition</Label>
                        <Input
                          value={item.startCondition || ''}
                          onChange={(event) => updateItem(item.key, { startCondition: event.target.value })}
                          disabled={!editable}
                        />
                      </Field>
                      <Field>
                        <Label>Billing notes</Label>
                        <Input
                          value={item.billingNotes || ''}
                          onChange={(event) => updateItem(item.key, { billingNotes: event.target.value })}
                          disabled={!editable}
                        />
                      </Field>
                    </Grid>

                    <Row style={{ justifyContent: 'space-between', fontSize: '0.78rem', color: '#475569' }}>
                      <span>
                        Line total:{' '}
                        <strong>{formatMoney(calc.lines[index]?.lineTotalCents || 0, currencyValue)}</strong>
                      </span>
                      <span>
                        Subtotal {formatMoney(calc.lines[index]?.lineSubtotalCents || 0, currencyValue)} ·
                        Discount {formatMoney(calc.lines[index]?.lineDiscountCents || 0, currencyValue)} ·
                        Tax {formatMoney(calc.lines[index]?.lineTaxCents || 0, currencyValue)}
                      </span>
                    </Row>
                  </LineCard>
                ))}
              </Stack>
            )}
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Proposal-level discount and totals</CardTitle>
                <CardText>
                  Discounts apply across included lines. Taxes are calculated per
                  line and rounded to the minor unit.
                </CardText>
              </div>
            </CardHead>
            <MiniGrid>
              <Field>
                <Label>Discount type</Label>
                <Select
                  value={discountType}
                  onChange={(event) => {
                    setDiscountType(event.target.value);
                    setDiscountValue(0);
                  }}
                  disabled={!editable}
                >
                  {Object.entries(DISCOUNT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>Discount {discountType === 'percent' ? '(%)' : `(${currencyValue})`}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    discountType === 'percent'
                      ? percentInput(discountValue)
                      : toMajorInput(discountValue)
                  }
                  onChange={(event) =>
                    setDiscountValue(
                      discountType === 'percent'
                        ? bpsFromPercent(event.target.value)
                        : toMinorInput(event.target.value),
                    )
                  }
                  disabled={!editable || discountType === 'none'}
                />
              </Field>
            </MiniGrid>

            <TotalsGrid>
              <TotalBox>
                <span>One-time subtotal</span>
                <strong>{formatMoney(calc.periods.one_time.subtotalCents, currencyValue)}</strong>
              </TotalBox>
              <TotalBox>
                <span>One-time discounts</span>
                <strong>{formatMoney(calc.periods.one_time.discountTotalCents, currencyValue)}</strong>
              </TotalBox>
              <TotalBox>
                <span>One-time tax (CGST / SGST / IGST)</span>
                <strong>
                  {formatMoney(calc.periods.one_time.cgstCents, currencyValue)} /{' '}
                  {formatMoney(calc.periods.one_time.sgstCents, currencyValue)} /{' '}
                  {formatMoney(calc.periods.one_time.igstCents, currencyValue)}
                </strong>
              </TotalBox>
              <TotalBox>
                <span>One-time total</span>
                <strong>{formatMoney(calc.totals.oneTimeTotalCents, currencyValue)}</strong>
              </TotalBox>
              {['monthly', 'quarterly', 'annual'].map((period) =>
                calc.periods[period].totalCents > 0 ? (
                  <TotalBox key={period}>
                    <span>{BILLING_TYPE_LABELS[period]} recurring</span>
                    <strong>{formatMoney(calc.periods[period].totalCents, currencyValue)}</strong>
                  </TotalBox>
                ) : null,
              )}
              {calc.periods.optional.totalCents > 0 ? (
                <TotalBox>
                  <span>Optional add-ons</span>
                  <strong>{formatMoney(calc.periods.optional.totalCents, currencyValue)}</strong>
                </TotalBox>
              ) : null}
            </TotalsGrid>
            <Hint>
              Recurring periods are quoted separately. No screen adds monthly,
              quarterly, annual or one-time amounts into a single figure.
            </Hint>
          </Card>
        </Stack>
      ) : null}

      {tab === 'scope' ? (
        <Stack $gap={14}>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Narrative and scope</CardTitle>
                <CardText>
                  These sections appear in the client document. Internal notes,
                  approval comments and pricing rationale never do.
                </CardText>
              </div>
            </CardHead>
            <Stack $gap={14}>
              {SECTION_GROUPS.filter((group) => group.key !== 'terms').flatMap((group) =>
                group.keys.map((key) => (
                  <Field key={key}>
                    <Label>{SECTION_LABELS[key]}</Label>
                    <Textarea
                      rows={key === 'scopeOfWork' ? 5 : 3}
                      value={sections[key] || ''}
                      onChange={(event) =>
                        setSections((current) => ({ ...current, [key]: event.target.value }))
                      }
                      disabled={!editable}
                    />
                  </Field>
                )),
              )}
            </Stack>
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Deliverables</CardTitle>
                <CardText>A clear, ordered list of what the client receives.</CardText>
              </div>
              {editable ? (
                <Button
                  type="button"
                  $variant="ghost"
                  onClick={() => setDeliverables((current) => [...current, localDeliverable(null, current.length)])}
                >
                  <Plus size={15} />
                  Add deliverable
                </Button>
              ) : null}
            </CardHead>
            {deliverables.length === 0 ? (
              <EmptyState>
                <FileText size={17} />
                <div>
                  <h3>No deliverables recorded</h3>
                  <p>Add deliverables so the client document is specific.</p>
                </div>
              </EmptyState>
            ) : (
              <Stack $gap={10}>
                {deliverables.map((entry, index) => (
                  <LineCard key={entry.key}>
                    <MiniGrid>
                      <Field>
                        <Label>Title</Label>
                        <Input
                          value={entry.title}
                          onChange={(event) =>
                            setDeliverables((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, title: event.target.value } : row,
                              ),
                            )
                          }
                          disabled={!editable}
                        />
                      </Field>
                      <Field>
                        <Label>Expected completion</Label>
                        <Input
                          value={entry.expectedCompletion}
                          onChange={(event) =>
                            setDeliverables((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, expectedCompletion: event.target.value } : row,
                              ),
                            )
                          }
                          placeholder="e.g. Week 2"
                          disabled={!editable}
                        />
                      </Field>
                      <Field>
                        <Label>Related service</Label>
                        <Select
                          value={entry.serviceId || ''}
                          onChange={(event) =>
                            setDeliverables((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, serviceId: event.target.value || null } : row,
                              ),
                            )
                          }
                          disabled={!editable}
                        >
                          <option value="">None</option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </MiniGrid>
                    <Field>
                      <Label>Description</Label>
                      <Textarea
                        rows={2}
                        value={entry.description || ''}
                        onChange={(event) =>
                          setDeliverables((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, description: event.target.value } : row,
                            ),
                          )
                        }
                        disabled={!editable}
                      />
                    </Field>
                    {editable ? (
                      <Actions>
                        <Button
                          type="button"
                          $variant="ghost"
                          onClick={() => setDeliverables((current) => current.filter((row) => row.key !== entry.key))}
                        >
                          <Trash2 size={14} /> Remove
                        </Button>
                      </Actions>
                    ) : null}
                  </LineCard>
                ))}
              </Stack>
            )}
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Milestones</CardTitle>
                <CardText>Delivery checkpoints with an expected period.</CardText>
              </div>
              {editable ? (
                <Button
                  type="button"
                  $variant="ghost"
                  onClick={() => setMilestones((current) => [...current, localDeliverable(null, current.length)])}
                >
                  <Plus size={15} />
                  Add milestone
                </Button>
              ) : null}
            </CardHead>
            {milestones.length === 0 ? (
              <EmptyState>
                <FileText size={17} />
                <div>
                  <h3>No milestones recorded</h3>
                  <p>Milestones help set expectations without guaranteeing outcomes.</p>
                </div>
              </EmptyState>
            ) : (
              <Stack $gap={10}>
                {milestones.map((entry, index) => (
                  <LineCard key={entry.key}>
                    <MiniGrid>
                      <Field>
                        <Label>Title</Label>
                        <Input
                          value={entry.title}
                          onChange={(event) =>
                            setMilestones((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, title: event.target.value } : row,
                              ),
                            )
                          }
                          disabled={!editable}
                        />
                      </Field>
                      <Field>
                        <Label>Expected completion</Label>
                        <Input
                          value={entry.expectedCompletion}
                          onChange={(event) =>
                            setMilestones((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, expectedCompletion: event.target.value } : row,
                              ),
                            )
                          }
                          placeholder="e.g. Month 1"
                          disabled={!editable}
                        />
                      </Field>
                      <Field>
                        <Label>Related service</Label>
                        <Select
                          value={entry.serviceId || ''}
                          onChange={(event) =>
                            setMilestones((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, serviceId: event.target.value || null } : row,
                              ),
                            )
                          }
                          disabled={!editable}
                        >
                          <option value="">None</option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </MiniGrid>
                    <Field>
                      <Label>Description</Label>
                      <Textarea
                        rows={2}
                        value={entry.description || ''}
                        onChange={(event) =>
                          setMilestones((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, description: event.target.value } : row,
                            ),
                          )
                        }
                        disabled={!editable}
                      />
                    </Field>
                    {editable ? (
                      <Actions>
                        <Button
                          type="button"
                          $variant="ghost"
                          onClick={() => setMilestones((current) => current.filter((row) => row.key !== entry.key))}
                        >
                          <Trash2 size={14} /> Remove
                        </Button>
                      </Actions>
                    ) : null}
                  </LineCard>
                ))}
              </Stack>
            )}
          </Card>
        </Stack>
      ) : null}

      {tab === 'terms' ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Terms and conditions</CardTitle>
              <CardText>
                Payment terms, validity, assumptions and client responsibilities.
              </CardText>
            </div>
          </CardHead>
          <Stack $gap={14}>
            {SECTION_GROUPS.find((group) => group.key === 'terms').keys.map((key) => (
              <Field key={key}>
                <Label>{SECTION_LABELS[key]}</Label>
                <Textarea
                  rows={3}
                  value={sections[key] || ''}
                  onChange={(event) =>
                    setSections((current) => ({ ...current, [key]: event.target.value }))
                  }
                  disabled={!editable}
                />
              </Field>
            ))}
          </Stack>
        </Card>
      ) : null}

      {tab === 'preview' ? (
        <Stack $gap={14}>
          <Notice $tone="info">
            <Printer size={15} />
            <span>
              This live preview reflects unsaved edits. Save the draft, then open{' '}
              <Link href={`/workspace/proposals/${detail.proposal.id}/preview`} target="_blank">
                print preview
              </Link>{' '}
              so the exported document matches the stored version exactly.
            </span>
          </Notice>
          <Card>
            <PreviewBody
              detail={detail}
              calc={calc}
              sections={sections}
              deliverables={deliverables}
              milestones={milestones}
              currency={currencyValue}
              validityDate={validityDate}
            />
          </Card>
        </Stack>
      ) : null}

      {tab === 'history' ? (
        <Stack $gap={14}>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Version history</CardTitle>
                <CardText>
                  Every revision is stored separately. Approved and sent versions
                  are never overwritten.
                </CardText>
              </div>
            </CardHead>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>One-time total</th>
                    <th>Validity</th>
                    <th>Created</th>
                    <th>Approved</th>
                    <th>Change summary</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.versions.map((entry) => {
                    const meta = statusMeta(entry.displayStatus);
                    return (
                      <tr key={entry.id}>
                        <td>
                          v{entry.versionNumber}
                          {entry.isCurrent ? ' · current' : ''}
                        </td>
                        <td>
                          <Badge $tone={meta.tone}>{meta.label}</Badge>
                        </td>
                        <td>{formatMoney(entry.grandTotalCents, entry.currency)}</td>
                        <td>{formatDate(entry.validityDate, timezone)}</td>
                        <td>
                          {formatDateTime(entry.createdAt, timezone)}
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {entry.createdByName || entry.createdByEmail || '—'}
                          </div>
                        </td>
                        <td>
                          {entry.approvedAt
                            ? `${formatDateTime(entry.approvedAt, timezone)} · ${entry.approvedByName || entry.approvedByEmail || ''}`
                            : '—'}
                        </td>
                        <td>{entry.changeSummary || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Approval history</CardTitle>
                <CardText>Decisions recorded during internal review.</CardText>
              </div>
            </CardHead>
            {detail.approvals.length === 0 ? (
              <Hint>No review decisions recorded yet.</Hint>
            ) : (
              <Stack $gap={8}>
                {detail.approvals.map((entry) => (
                  <Row key={entry.id} style={{ justifyContent: 'space-between' }}>
                    <span>
                      <Badge $tone={entry.decision === 'approved' ? 'success' : 'warning'}>
                        {entry.decision === 'approved' ? 'Approved' : 'Changes requested'}
                      </Badge>{' '}
                      {entry.actorName || entry.actorEmail || 'A reviewer'} ·{' '}
                      {formatDateTime(entry.createdAt, timezone)}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#475569' }}>{entry.notes || ''}</span>
                  </Row>
                ))}
              </Stack>
            )}
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Activity</CardTitle>
                <CardText>Saved proposal events, newest first.</CardText>
              </div>
            </CardHead>
            {detail.activity.length === 0 ? (
              <Hint>No activity recorded yet.</Hint>
            ) : (
              <Stack $gap={8}>
                {detail.activity.map((entry) => (
                  <Row key={entry.id} style={{ justifyContent: 'space-between' }}>
                    <span>
                      <strong>{PROPOSAL_ACTIVITY_LABELS[entry.type] || entry.type}</strong>{' '}
                      {entry.body ? `— ${entry.body}` : ''}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                      {entry.actorName || entry.actorEmail || 'System'} ·{' '}
                      {formatDateTime(entry.createdAt, timezone)}
                    </span>
                  </Row>
                ))}
              </Stack>
            )}
          </Card>
        </Stack>
      ) : null}

      <Hint>
        <ShieldAlert size={12} aria-hidden="true" /> Regulated services name the
        responsible professional in the exported document. MK Group Digital does
        not certify, sign or file on a professional&apos;s behalf.
      </Hint>
    </Page>
  );
}

function PreviewBody({ detail, calc, sections, deliverables, milestones, currency, validityDate }) {
  const version = detail.currentVersion;
  const groups = ['one_time', 'monthly', 'quarterly', 'annual'];
  const labels = {
    one_time: 'One-time services',
    monthly: 'Monthly recurring',
    quarterly: 'Quarterly recurring',
    annual: 'Annual recurring',
  };

  return (
    <Stack $gap={16}>
      <div>
        <Eyebrow>{detail.proposal.reference}</Eyebrow>
        <Title style={{ fontSize: '1.3rem' }}>{detail.proposal.title}</Title>
        <Lead>
          {detail.proposal.companyName || 'Client'} · Version {version.versionNumber} ·
          Valid until {formatDate(validityDate, 'UTC')}
        </Lead>
      </div>

      {SECTION_GROUPS.flatMap((group) => group.keys)
        .filter((key) => sections[key])
        .map((key) => (
          <PreviewSection key={key}>
            <h4>{SECTION_LABELS[key]}</h4>
            <p>{sections[key]}</p>
          </PreviewSection>
        ))}

      {deliverables.filter((entry) => entry.title).length > 0 ? (
        <PreviewSection>
          <h4>Deliverables</h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.7 }}>
            {deliverables
              .filter((entry) => entry.title)
              .map((entry) => (
                <li key={entry.key}>
                  <strong>{entry.title}</strong>
                  {entry.expectedCompletion ? ` — ${entry.expectedCompletion}` : ''}
                  {entry.description ? `: ${entry.description}` : ''}
                </li>
              ))}
          </ul>
        </PreviewSection>
      ) : null}

      {milestones.filter((entry) => entry.title).length > 0 ? (
        <PreviewSection>
          <h4>Milestones</h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.7 }}>
            {milestones
              .filter((entry) => entry.title)
              .map((entry) => (
                <li key={entry.key}>
                  <strong>{entry.title}</strong>
                  {entry.expectedCompletion ? ` — ${entry.expectedCompletion}` : ''}
                </li>
              ))}
          </ul>
        </PreviewSection>
      ) : null}

      {groups.map((key) => {
        const lines = calc.lines.filter(
          (line) =>
            line.kind === 'included' &&
            (key === 'one_time' ? !RECURRING.has(line.billingType) : line.billingType === key),
        );
        if (lines.length === 0) return null;
        return (
          <PreviewSection key={key}>
            <h4>{labels[key]}</h4>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Discount</th>
                    <th>Tax</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key}>
                      <td>{line.name}</td>
                      <td>
                        {line.quantity} {line.unit}
                      </td>
                      <td>{formatMoney(line.unitPriceCents, currency)}</td>
                      <td>{formatMoney(line.lineDiscountCents, currency)}</td>
                      <td>{formatMoney(line.lineTaxCents, currency)}</td>
                      <td>{formatMoney(line.lineTotalCents, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Row style={{ justifyContent: 'flex-end', fontSize: '0.82rem' }}>
              Subtotal {formatMoney(calc.periods[key].subtotalCents, currency)} ·
              Discounts {formatMoney(calc.periods[key].discountTotalCents, currency)} ·
              Tax {formatMoney(calc.periods[key].taxCents, currency)} ·{' '}
              <strong>Total {formatMoney(calc.periods[key].totalCents, currency)}</strong>
            </Row>
          </PreviewSection>
        );
      })}

      {calc.lines.filter((line) => line.kind === 'optional').length > 0 ? (
        <PreviewSection>
          <h4>Optional add-ons</h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.7 }}>
            {calc.lines
              .filter((line) => line.kind === 'optional')
              .map((line) => (
                <li key={line.key}>
                  {line.name} — {formatMoney(line.lineTotalCents, currency)}
                </li>
              ))}
          </ul>
        </PreviewSection>
      ) : null}

      {calc.lines.filter((line) => line.kind === 'excluded').length > 0 ? (
        <PreviewSection>
          <h4>Explicitly excluded</h4>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.7 }}>
            {calc.lines
              .filter((line) => line.kind === 'excluded')
              .map((line) => (
                <li key={line.key}>{line.name}</li>
              ))}
          </ul>
        </PreviewSection>
      ) : null}

      <Hint>
        This is a commercial proposal, not an invoice. It does not certify, sign
        or file anything and does not record client acceptance.
      </Hint>
    </Stack>
  );
}
