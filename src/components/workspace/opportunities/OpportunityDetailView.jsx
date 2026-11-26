'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  ClipboardCopy,
  CircleAlert,
  FileText,
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Target,
  UserCheck,
  X,
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
  Eyebrow,
  Grid,
  Header,
  Hint,
  Lead,
  LinkButton,
  Notice,
  Page,
  Pre,
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
} from '@/components/workspace/ai/primitives';
import { formatValue, isOverdue, metaFor } from '@/components/workspace/phase2c/meta';
import {
  DISCOVERY_STATUS_META,
  OPPORTUNITY_ACTIVITY_LABELS,
  OPPORTUNITY_STAGE_META,
  REQUIREMENT_STATUS_META,
} from '@/components/workspace/phase2d/meta';
import {
  formatMoney as formatProposalMoney,
  statusMeta as proposalStatusMeta,
} from '@/components/workspace/proposals/meta';
import DiscoveryForm from './DiscoveryForm';
import OpportunityForm from './OpportunityForm';
import RequirementForm from './RequirementForm';

function SectionMessage({ tone = 'success', children }) {
  return (
    <Notice $tone={tone}>
      {tone === 'success' ? <BadgeCheck size={15} /> : <CircleAlert size={15} />}
      <span>{children}</span>
    </Notice>
  );
}

export default function OpportunityDetailView({
  detail,
  document,
  members,
  services,
  timezone,
  canEdit,
  canAssign,
  canClose,
  canEditRequirements,
  canViewRequirements,
  canRunAi,
  proposals = [],
  canViewProposals = false,
  canCreateProposal = false,
  canExportProposal = false,
}) {
  const router = useRouter();
  const { opportunity } = detail;

  const [showEdit, setShowEdit] = useState(false);
  const [message, setMessage] = useState(null);
  const [failure, setFailure] = useState(null);

  const [stageTarget, setStageTarget] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [stageBusy, setStageBusy] = useState(false);

  const [ownerUserId, setOwnerUserId] = useState(opportunity.ownerUserId || '');
  const [assignBusy, setAssignBusy] = useState(false);

  const [noteBody, setNoteBody] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);

  const [showRequirementForm, setShowRequirementForm] = useState(false);
  const [editingRequirementId, setEditingRequirementId] = useState(null);

  const [instruction, setInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const stageOptions = useMemo(
    () =>
      detail.allowedTransitions.filter(
        (stage) => canClose || (stage !== 'won' && stage !== 'lost'),
      ),
    [detail.allowedTransitions, canClose],
  );

  const editingRequirement = detail.requirementItems.find(
    (item) => item.id === editingRequirementId,
  );

  function flash(text) {
    setFailure(null);
    setMessage(text);
    router.refresh();
  }

  function fail(error) {
    setMessage(null);
    setFailure(error.message);
  }

  async function submitStage(event) {
    event.preventDefault();
    if (!stageTarget) {
      setFailure('Choose the next stage.');
      return;
    }
    setStageBusy(true);
    setMessage(null);
    setFailure(null);
    try {
      const result = await apiRequest(
        `/api/workforce/opportunities/${opportunity.id}/stage`,
        {
          method: 'POST',
          body: {
            stage: stageTarget,
            note: stageNote.trim() || null,
            lostReason:
              stageTarget === 'lost' ? lostReason.trim() || null : null,
          },
        },
      );
      setStageTarget('');
      setStageNote('');
      setLostReason('');
      flash(
        result.changed
          ? `Stage updated to ${metaFor(OPPORTUNITY_STAGE_META, result.opportunity.stage).label}.`
          : 'The opportunity is already at that stage.',
      );
    } catch (error) {
      fail(error);
    } finally {
      setStageBusy(false);
    }
  }

  async function submitAssign(event) {
    event.preventDefault();
    setAssignBusy(true);
    setMessage(null);
    setFailure(null);
    try {
      const result = await apiRequest(
        `/api/workforce/opportunities/${opportunity.id}/assign`,
        {
          method: 'POST',
          body: { ownerUserId: ownerUserId || null },
        },
      );
      flash(
        result.changed
          ? 'Sales owner updated.'
          : 'The opportunity already has that owner.',
      );
    } catch (error) {
      fail(error);
    } finally {
      setAssignBusy(false);
    }
  }

  async function submitNote(event) {
    event.preventDefault();
    if (noteBody.trim().length < 2) {
      setFailure('Write at least two characters before saving a note.');
      return;
    }
    setNoteBusy(true);
    setMessage(null);
    setFailure(null);
    try {
      await apiRequest(
        `/api/workforce/opportunities/${opportunity.id}/notes`,
        { method: 'POST', body: { body: noteBody.trim() } },
      );
      setNoteBody('');
      flash('Note added to the activity timeline.');
    } catch (error) {
      fail(error);
    } finally {
      setNoteBusy(false);
    }
  }

  async function requestAiDraft() {
    setAiBusy(true);
    setMessage(null);
    setFailure(null);
    setAiResult(null);
    try {
      const result = await apiRequest(
        `/api/workforce/opportunities/${opportunity.id}/ai-draft`,
        {
          method: 'POST',
          body: { instruction: instruction.trim() || null },
        },
      );
      setAiResult(result);
    } catch (error) {
      fail(error);
    } finally {
      setAiBusy(false);
    }
  }

  async function copyDocument() {
    if (!document?.text) return;
    try {
      await navigator.clipboard.writeText(document.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailure('Copying was blocked by the browser. Select the text and copy it manually.');
    }
  }

  const stage = metaFor(OPPORTUNITY_STAGE_META, opportunity.stage);
  const discoveryStatus = detail.discovery
    ? metaFor(DISCOVERY_STATUS_META, detail.discovery.status)
    : null;
  const overdue = isOverdue(opportunity.nextFollowUpAt);
  const closed = opportunity.stage === 'won' || opportunity.stage === 'lost';

  return (
    <Page>
      <Header>
        <Eyebrow>Opportunity · {opportunity.companyName}</Eyebrow>
        <Title>{opportunity.title}</Title>
        <Lead>
          <Link href={`/workspace/leads/${opportunity.leadId}`}>
            {opportunity.companyName}
          </Link>
          {opportunity.contactName ? ` · ${opportunity.contactName}` : ''}
        </Lead>
      </Header>

      <Actions>
        <LinkButton href="/workspace/opportunities">
          <ArrowLeft size={14} />
          Pipeline
        </LinkButton>
        <LinkButton href={`/workspace/leads/${opportunity.leadId}`}>
          Open lead
        </LinkButton>
        {canEdit ? (
          <Button type="button" onClick={() => setShowEdit((value) => !value)}>
            {showEdit ? <X size={14} /> : <Pencil size={14} />}
            {showEdit ? 'Close editor' : 'Edit details'}
          </Button>
        ) : null}
      </Actions>

      {message ? <SectionMessage tone="success">{message}</SectionMessage> : null}
      {failure ? <SectionMessage tone="danger">{failure}</SectionMessage> : null}

      <StatGrid>
        <StatCard>
          <StatLabel>Stage</StatLabel>
          <StatValue>{stage.label}</StatValue>
          <StatNote>
            {closed
              ? 'Closed opportunity'
              : `${detail.allowedTransitions.length} possible next stage(s)`}
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Expected value</StatLabel>
          <StatValue>
            {formatValue(opportunity.expectedValueCents, opportunity.currency)}
          </StatValue>
          <StatNote>Expected, not received revenue</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Expected close</StatLabel>
          <StatValue style={{ fontSize: '1rem' }}>
            {formatDate(opportunity.expectedCloseDate, timezone)}
          </StatValue>
          <StatNote>
            Follow-up {formatDateTime(opportunity.nextFollowUpAt, timezone)}
            {overdue ? ' · overdue' : ''}
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Sales owner</StatLabel>
          <StatValue style={{ fontSize: '1rem' }}>
            {opportunity.ownerName || opportunity.ownerEmail || 'Unassigned'}
          </StatValue>
          <StatNote>
            {opportunity.source} · priority {opportunity.priority}
          </StatNote>
        </StatCard>
      </StatGrid>

      {showEdit && canEdit ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Edit opportunity details</CardTitle>
              <CardText>
                Stage changes are handled separately so the pipeline history
                stays accurate.
              </CardText>
            </div>
          </CardHead>
          <OpportunityForm
            opportunity={opportunity}
            members={members}
            canAssign={false}
            onDone={() => {
              setShowEdit(false);
              flash('Opportunity details saved.');
            }}
            onCancel={() => setShowEdit(false)}
          />
        </Card>
      ) : null}

      <Grid $cols={2}>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Stage workflow</CardTitle>
              <CardText>
                Moving to won or lost closes the opportunity. Closing does not
                convert the lead into a client or create a contract.
              </CardText>
            </div>
            <Badge $tone={stage.tone}>{stage.label}</Badge>
          </CardHead>

          {opportunity.lostReason ? (
            <Notice $tone="danger">
              <span>Lost reason: {opportunity.lostReason}</span>
            </Notice>
          ) : null}

          {canEdit && stageOptions.length > 0 ? (
            <form onSubmit={submitStage}>
              <Stack $gap={12}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                    Move to stage
                  </span>
                  <Select
                    value={stageTarget}
                    onChange={(event) => setStageTarget(event.target.value)}
                    disabled={stageBusy}
                  >
                    <option value="">Choose a stage</option>
                    {stageOptions.map((option) => (
                      <option key={option} value={option}>
                        {metaFor(OPPORTUNITY_STAGE_META, option).label}
                      </option>
                    ))}
                  </Select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                    Stage note (optional)
                  </span>
                  <Textarea
                    value={stageNote}
                    onChange={(event) => setStageNote(event.target.value)}
                    maxLength={500}
                    style={{ minHeight: 64 }}
                    placeholder="Context for the pipeline history."
                    disabled={stageBusy}
                  />
                </label>

                {stageTarget === 'lost' ? (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      Lost reason
                    </span>
                    <Textarea
                      value={lostReason}
                      onChange={(event) => setLostReason(event.target.value)}
                      maxLength={1_000}
                      style={{ minHeight: 64 }}
                      placeholder="Why the opportunity was lost."
                      disabled={stageBusy}
                      required
                    />
                  </label>
                ) : null}

                <Button
                  type="submit"
                  $variant="primary"
                  disabled={stageBusy}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {stageBusy ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Target size={14} />
                  )}
                  {stageBusy ? 'Updating…' : 'Update stage'}
                </Button>
              </Stack>
            </form>
          ) : (
            <Hint>
              {closed
                ? 'This opportunity is closed. A lost opportunity can be reopened at discovery if work resumes.'
                : !canEdit
                  ? 'Your role can view this opportunity but not change its stage.'
                  : 'No stage changes are available from here.'}
            </Hint>
          )}
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>Sales owner</CardTitle>
              <CardText>
                Assignment only changes who owns the pipeline record. It does
                not grant workspace permissions.
              </CardText>
            </div>
            <UserCheck size={16} aria-hidden="true" />
          </CardHead>

          {canAssign ? (
            <form onSubmit={submitAssign}>
              <Stack $gap={12}>
                <Select
                  value={ownerUserId}
                  onChange={(event) => setOwnerUserId(event.target.value)}
                  disabled={assignBusy}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name || member.email}
                    </option>
                  ))}
                </Select>
                <Button
                  type="submit"
                  disabled={assignBusy}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {assignBusy ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <UserCheck size={14} />
                  )}
                  {assignBusy ? 'Saving…' : 'Save owner'}
                </Button>
              </Stack>
            </form>
          ) : (
            <Hint>
              Your role cannot reassign opportunities. Current owner:{' '}
              {opportunity.ownerName || opportunity.ownerEmail || 'Unassigned'}.
            </Hint>
          )}
        </Card>
      </Grid>

      {canViewRequirements ? (
        <>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Discovery and requirements</CardTitle>
                <CardText>
                  Structured discovery feeds the requirement document. Approval
                  here only marks the discovery record reviewed.
                </CardText>
              </div>
              {discoveryStatus ? (
                <Badge $tone={discoveryStatus.tone}>{discoveryStatus.label}</Badge>
              ) : (
                <Badge $tone="muted">No discovery saved</Badge>
              )}
            </CardHead>
            <DiscoveryForm
              opportunityId={opportunity.id}
              discovery={detail.discovery}
              canEdit={canEditRequirements}
              onSaved={() => flash('Discovery saved.')}
            />
          </Card>

          <Card>
        <CardHead>
          <div>
            <CardTitle>Service requirements</CardTitle>
            <CardText>
              Each requirement can link to a catalogue service. Regulated
              services show the responsible professional.
            </CardText>
          </div>
          <Actions>
            {canEditRequirements ? (
              <Button
                type="button"
                $variant="primary"
                onClick={() => {
                  setEditingRequirementId(null);
                  setShowRequirementForm((value) => !value);
                }}
              >
                {showRequirementForm ? <X size={14} /> : <Plus size={14} />}
                {showRequirementForm ? 'Close form' : 'Add requirement'}
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {showRequirementForm && canEditRequirements ? (
          <div
            style={{
              padding: 16,
              border: '1px solid #E5EAF1',
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            <RequirementForm
              opportunityId={opportunity.id}
              services={services}
              onDone={() => {
                setShowRequirementForm(false);
                flash('Requirement added.');
              }}
              onCancel={() => setShowRequirementForm(false)}
            />
          </div>
        ) : null}

        {detail.requirementItems.length === 0 ? (
          <EmptyState>
            <FileText size={17} aria-hidden="true" />
            <div>
              <h3>No requirements recorded yet</h3>
              <p>
                Add the services the client needs. Requirements appear in the
                generated requirement document.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Service</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Updated</th>
                  {canEditRequirements ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {detail.requirementItems.map((item) => {
                  const status = metaFor(REQUIREMENT_STATUS_META, item.status);
                  return (
                    <tr key={item.id}>
                      <td>
                        {item.name}
                        {item.description ? (
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {item.description}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {item.serviceName || '—'}
                        {item.serviceCategory ? (
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {item.serviceCategory}
                          </div>
                        ) : null}
                        {item.regulated ? (
                          <div style={{ marginTop: 4 }}>
                            <Badge $tone="warning">
                              <ShieldAlert size={11} /> {item.reviewProfession || 'Regulated'}
                            </Badge>
                          </div>
                        ) : null}
                      </td>
                      <td>{item.priority}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>{formatDateTime(item.updatedAt, timezone)}</td>
                      {canEditRequirements ? (
                        <td>
                          <Button
                            type="button"
                            $variant="ghost"
                            onClick={() => {
                              setShowRequirementForm(false);
                              setEditingRequirementId((current) =>
                                current === item.id ? null : item.id,
                              );
                            }}
                          >
                            <Pencil size={13} />
                            Edit
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}

        {editingRequirement && canEditRequirements ? (
          <div
            style={{
              padding: 16,
              border: '1px solid #E5EAF1',
              borderRadius: 12,
              marginTop: 12,
            }}
          >
            <RequirementForm
              key={editingRequirement.id}
              opportunityId={opportunity.id}
              requirement={editingRequirement}
              services={services}
              onDone={() => {
                setEditingRequirementId(null);
                flash('Requirement updated.');
              }}
              onCancel={() => setEditingRequirementId(null)}
            />
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Requirement document</CardTitle>
            <CardText>
              Generated from saved discovery and requirement records. It is not
              a proposal, quotation, contract or invoice.
            </CardText>
          </div>
          <Actions>
            <Button type="button" $variant="ghost" onClick={copyDocument}>
              <ClipboardCopy size={14} />
              {copied ? 'Copied' : 'Copy text'}
            </Button>
          </Actions>
        </CardHead>

        {document ? (
          <>
            <Row>
              <Badge $tone="info">{document.reference}</Badge>
              <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                Generated {formatDateTime(document.generatedAt, timezone)}
              </span>
            </Row>
            <Pre>{document.text}</Pre>
            <Hint>
              Refresh the page to regenerate the document after editing
              discovery or requirements.
            </Hint>
          </>
        ) : (
          <EmptyState>
            <FileText size={17} aria-hidden="true" />
            <div>
              <h3>Document unavailable</h3>
              <p>Reload the page to generate the requirement document.</p>
            </div>
          </EmptyState>
        )}
      </Card>
        </>
      ) : null}

      {canViewProposals ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Proposals</CardTitle>
              <CardText>
                Every proposal linked to this opportunity. A proposal can be
                accepted or rejected on its own; the opportunity stage never
                changes automatically.
              </CardText>
            </div>
            <Actions>
              {canCreateProposal ? (
                <LinkButton
                  href={`/workspace/proposals/new?opportunityId=${opportunity.id}`}
                  $variant="primary"
                >
                  <Plus size={14} />
                  New proposal
                </LinkButton>
              ) : null}
            </Actions>
          </CardHead>

          {proposals.length === 0 ? (
            <Hint>
              No proposals yet. Creating one prefills from approved discovery
              and confirmed requirements, and prices always start at zero.
            </Hint>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Proposal</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>One-time total</th>
                    <th>Monthly</th>
                    <th>Valid until</th>
                    <th>Updated</th>
                    {canExportProposal ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((entry) => {
                    const status = proposalStatusMeta(entry.displayStatus);
                    const currency = entry.versionCurrency || entry.currency || 'INR';
                    return (
                      <tr key={entry.id}>
                        <td>
                          <Link href={`/workspace/proposals/${entry.id}`}>
                            {entry.title}
                          </Link>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {entry.reference}
                          </div>
                        </td>
                        <td>
                          <Badge $tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td>v{entry.versionNumber}</td>
                        <td>{formatProposalMoney(entry.oneTimeTotalCents, currency)}</td>
                        <td>{formatProposalMoney(entry.recurringMonthlyCents, currency)}</td>
                        <td>{formatDate(entry.validityDate, timezone)}</td>
                        <td>{formatDateTime(entry.updatedAt, timezone)}</td>
                        {canExportProposal ? (
                          <td>
                            <Link
                              href={`/workspace/proposals/${entry.id}/preview`}
                              target="_blank"
                            >
                              Preview
                            </Link>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      ) : null}

      {canRunAi ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>AI requirement draft</CardTitle>
              <CardText>
                Queues an existing sales agent using the saved records. Output
                is labelled as an AI draft and cannot approve proposals, sign
                contracts, confirm payments, make filings or change financial
                records.
              </CardText>
            </div>
            <Sparkles size={16} aria-hidden="true" />
          </CardHead>

          <Stack $gap={12}>
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              maxLength={1_000}
              style={{ minHeight: 64 }}
              placeholder="Optional instruction, for example: highlight missing information and suggested next questions."
              disabled={aiBusy}
            />
            <Button
              type="button"
              $variant="primary"
              onClick={requestAiDraft}
              disabled={aiBusy}
              style={{ alignSelf: 'flex-start' }}
            >
              {aiBusy ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {aiBusy ? 'Queueing…' : 'Queue AI draft'}
            </Button>

            {aiResult ? (
              <Notice $tone="info">
                <span>
                  AI draft queued as run{' '}
                  <Link href={`/workspace/ai-workforce/runs/${aiResult.run.id}`}>
                    {aiResult.run.id.slice(0, 8)}
                  </Link>{' '}
                  with status {aiResult.run.status}
                  {aiResult.run.approvalRequired
                    ? ' and requires approval before it can execute.'
                    : '.'}{' '}
                  {aiResult.reused ? 'An identical queued run was reused.' : ''}
                </span>
              </Notice>
            ) : null}
            <Hint>
              If AI is not configured or no eligible sales agent exists, the
              request fails with a clear message. The rest of this page works
              without AI.
            </Hint>
          </Stack>
        </Card>
      ) : null}

      <Grid $cols={2}>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Activity</CardTitle>
              <CardText>Notes and system-recorded changes.</CardText>
            </div>
            <NotebookPen size={16} aria-hidden="true" />
          </CardHead>

          {canEdit ? (
            <form onSubmit={submitNote}>
              <Stack $gap={10}>
                <Textarea
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  maxLength={5_000}
                  style={{ minHeight: 70 }}
                  placeholder="Add context for the team."
                  disabled={noteBusy}
                />
                <Button
                  type="submit"
                  disabled={noteBusy}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {noteBusy ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <NotebookPen size={14} />
                  )}
                  {noteBusy ? 'Saving…' : 'Add note'}
                </Button>
              </Stack>
            </form>
          ) : null}

          {detail.activities.length === 0 ? (
            <Hint>No activity recorded yet.</Hint>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {detail.activities.map((activity) => (
                <li
                  key={activity.id}
                  style={{ borderBottom: '1px solid #E5EAF1', paddingBottom: 8 }}
                >
                  <strong style={{ fontSize: '0.8rem' }}>
                    {OPPORTUNITY_ACTIVITY_LABELS[activity.type] || activity.type}
                  </strong>
                  {activity.body ? (
                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#475569' }}>
                      {activity.body}
                    </p>
                  ) : null}
                  <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                    {activity.actorName || activity.actorEmail || 'System'} ·{' '}
                    {formatDateTime(activity.createdAt, timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>Stage history</CardTitle>
              <CardText>Every pipeline transition is recorded.</CardText>
            </div>
            <Target size={16} aria-hidden="true" />
          </CardHead>

          {detail.stageHistory.length === 0 ? (
            <Hint>No stage changes recorded yet.</Hint>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {detail.stageHistory.map((entry) => (
                <li key={entry.id} style={{ fontSize: '0.78rem' }}>
                  <strong>
                    {entry.fromStage
                      ? `${metaFor(OPPORTUNITY_STAGE_META, entry.fromStage).label} → `
                      : ''}
                    {metaFor(OPPORTUNITY_STAGE_META, entry.toStage).label}
                  </strong>
                  {entry.note ? <p style={{ margin: '2px 0 0' }}>{entry.note}</p> : null}
                  <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                    {entry.changedByName || entry.changedByEmail || 'System'} ·{' '}
                    {formatDateTime(entry.createdAt, timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Grid>

      <Hint>
        Closing an opportunity records pipeline outcome only. Proposals are
        tracked separately, and contracts, payments and projects remain for
        later 2D stages. Nothing here converts automatically.
      </Hint>
    </Page>
  );
}
