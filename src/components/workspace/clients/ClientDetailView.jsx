'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Building2,
  CalendarClock,
  CircleAlert,
  FileText,
  LifeBuoy,
  Loader2,
  Mail,
  NotebookPen,
  Pencil,
  Plus,
  Receipt,
  Users,
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
  Eyebrow,
  Field,
  Header,
  Hint,
  Label,
  Lead,
  Notice,
  Page,
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
import {
  MetaGrid,
  Subhead,
  Timeline,
  TimelineItem,
} from '@/components/workspace/phase2c/ui';
import { formatMoney } from '@/components/workspace/proposals/meta';
import {
  CLIENT_STATUS_META,
  ENGAGEMENT_FREQUENCY_LABELS,
  ENGAGEMENT_STATUS_META,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_META,
  TICKET_STATUS_META,
  TIMELINE_SOURCE_LABELS,
  TIMELINE_TYPE_LABELS,
  metaFor,
} from './meta';
import ClientEditForm from './ClientEditForm';
import ContactForm from './ContactForm';
import EngagementForm from './EngagementForm';
import TicketForm from './TicketForm';
import TimelineEntryForm from './TimelineEntryForm';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'engagements', label: 'Engagements' },
  { key: 'tickets', label: 'Support' },
  { key: 'billing', label: 'Billing summary' },
  { key: 'timeline', label: 'Timeline' },
];

function humanize(type) {
  return String(type || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eventLabel(event) {
  if (event.source === 'manual') {
    return TIMELINE_TYPE_LABELS[event.type] || humanize(event.type);
  }
  if (event.type === 'ticket') return 'Ticket created';
  if (event.type === 'ticket_resolved') return 'Ticket resolved';
  if (event.type === 'invoice_issued') return 'Invoice issued';
  if (event.type === 'payment_recorded') return 'Payment recorded';
  return humanize(event.type);
}

const OPEN_STATUSES = ['open', 'assigned', 'in_progress', 'waiting_client'];

export default function ClientDetailView({
  detail,
  members,
  services,
  timezone,
  permissions,
  canRunAi,
  canCreateTicket,
}) {
  const router = useRouter();
  const { client, lead, contacts, projects, proposals, engagements, tickets, billing, timeline } =
    detail;
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [contactEditing, setContactEditing] = useState(null);
  const [contactCreating, setContactCreating] = useState(false);
  const [engagementEditing, setEngagementEditing] = useState(null);
  const [engagementCreating, setEngagementCreating] = useState(false);
  const [ticketCreating, setTicketCreating] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const statusMeta = metaFor(CLIENT_STATUS_META, client.status);
  const openTickets = tickets.filter((entry) => OPEN_STATUSES.includes(entry.status));
  const activeEngagements = engagements.filter((entry) => entry.status === 'active');
  const billingCurrency = billing.recentInvoices[0]?.currency || 'INR';

  const linkOptions = {
    services: services || [],
    proposals: proposals.map((entry) => ({
      id: entry.id,
      reference: entry.reference,
      title: entry.title,
    })),
    projects,
  };

  function refresh() {
    router.refresh();
  }

  async function requestBrief() {
    setAiBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      const result = await apiRequest(`/api/workforce/clients/${client.id}/ai-brief`, {
        method: 'POST',
        body: { instruction: aiInstruction.trim() || null },
      });
      setNotice(
        `AI brief queued with ${result.agent?.name || 'an assistant'}. Review the run before using it.`,
      );
      setAiInstruction('');
    } catch (error) {
      setFailure(error.message);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/clients">Clients</Link> · {client.reference}
        </Eyebrow>
        <Title>{client.companyName}</Title>
        <Lead>
          {client.industry ? `${client.industry} · ` : ''}
          Relationship owner {client.ownerName || client.ownerEmail || 'unassigned'} ·{' '}
          {activeEngagements.length} active engagements · {openTickets.length} open
          tickets.
        </Lead>
      </Header>

      <Stack $gap={10}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Badge $tone={statusMeta.tone}>{statusMeta.label}</Badge>
          {lead ? (
            <Link href={`/workspace/leads/${lead.id}`}>
              <Badge $tone="info">Lead {lead.companyName}</Badge>
            </Link>
          ) : null}
          {client.email ? (
            <Badge $tone="muted">
              <Mail size={12} /> {client.email}
            </Badge>
          ) : null}
        </div>

        {failure ? <Notice $tone="danger">{failure}</Notice> : null}
        {notice ? <Notice $tone="success">{notice}</Notice> : null}
      </Stack>

      <StatGrid>
        <StatCard>
          <StatLabel>Delivery projects</StatLabel>
          <StatValue>{projects.length}</StatValue>
          <StatNote>
            {projects.filter((entry) => entry.status === 'in_progress').length} in
            progress
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Active engagements</StatLabel>
          <StatValue>{activeEngagements.length}</StatValue>
          <StatNote>{engagements.length} engagements recorded</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Open tickets</StatLabel>
          <StatValue>{openTickets.length}</StatValue>
          <StatNote>{tickets.length} tickets recorded</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Outstanding receivables</StatLabel>
          <StatValue>{formatMoney(billing.outstandingCents, billingCurrency)}</StatValue>
          <StatNote>
            {formatMoney(billing.collectedCents, billingCurrency)} collected
          </StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {TABS.map((entry) => (
            <Button
              key={entry.key}
              type="button"
              $variant={tab === entry.key ? 'primary' : 'ghost'}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </Button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {canRunAi ? (
              <Button type="button" $variant="ghost" onClick={() => setTab('overview')}>
                <Bot size={14} />
                AI brief
              </Button>
            ) : null}
            {permissions.canEdit ? (
              <Button type="button" $variant="ghost" onClick={() => setEditing(true)}>
                <Pencil size={14} />
                Edit client
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {editing ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Edit client profile</CardTitle>
              <CardText>Changes use optimistic concurrency protection.</CardText>
            </div>
            <Pencil size={16} aria-hidden="true" />
          </CardHead>
          <ClientEditForm
            client={client}
            members={members}
            onDone={() => {
              setEditing(false);
              setNotice('Client profile saved.');
              refresh();
            }}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : null}

      {tab === 'overview' ? (
        <>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Relationship details</CardTitle>
                <CardText>Identifiers, contact details and ownership.</CardText>
              </div>
              <Building2 size={16} aria-hidden="true" />
            </CardHead>
            <MetaGrid>
              <div>
                <dt>Reference</dt>
                <dd>{client.reference}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{statusMeta.label}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{client.ownerName || client.ownerEmail || 'Unassigned'}</dd>
              </div>
              <div>
                <dt>Primary contact</dt>
                <dd>{client.primaryContactName || '—'}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{client.email || '—'}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{client.phone || '—'}</dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>{client.website || '—'}</dd>
              </div>
              <div>
                <dt>Industry</dt>
                <dd>{client.industry || '—'}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{client.address || '—'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(client.createdAt, timezone)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDateTime(client.updatedAt, timezone)}</dd>
              </div>
              <div>
                <dt>Linked lead</dt>
                <dd>
                  {lead ? (
                    <Link href={`/workspace/leads/${lead.id}`}>{lead.companyName}</Link>
                  ) : (
                    'No lead link'
                  )}
                </dd>
              </div>
            </MetaGrid>
          </Card>

          {permissions.canEdit ? (
            <Card>
              <CardHead>
                <div>
                  <CardTitle>Internal notes</CardTitle>
                  <CardText>Never shown to the client or included in AI client-visible output.</CardText>
                </div>
                <CircleAlert size={16} aria-hidden="true" />
              </CardHead>
              <CardText>{client.internalNotes || 'No internal notes recorded.'}</CardText>
            </Card>
          ) : null}

          <Card>
            <CardHead>
              <div>
                <CardTitle>Sales and delivery links</CardTitle>
                <CardText>The lead history stays intact; nothing is rewritten.</CardText>
              </div>
              <FileText size={16} aria-hidden="true" />
            </CardHead>
            <Subhead>Proposals</Subhead>
            {proposals.length === 0 ? (
              <CardText>No proposals linked through the originating lead.</CardText>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Proposal</th>
                      <th>Status</th>
                      <th>Version</th>
                      <th>Value</th>
                      <th>Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <Link href={`/workspace/proposals/${entry.id}`}>
                            {entry.reference}
                          </Link>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {entry.title}
                          </div>
                        </td>
                        <td>{humanize(entry.status)}</td>
                        <td>{entry.versionNumber || '—'}</td>
                        <td>{formatMoney(entry.grandTotalCents, entry.currency)}</td>
                        <td>{formatDate(entry.respondedAt || entry.createdAt, timezone)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
            <Subhead>Projects</Subhead>
            {projects.length === 0 ? (
              <CardText>No delivery projects yet.</CardText>
            ) : (
              <MetaGrid>
                {projects.map((entry) => (
                  <div key={entry.id}>
                    <dt>{entry.reference}</dt>
                    <dd>
                      <Link href={`/workspace/projects/${entry.id}`}>{entry.name}</Link>{' '}
                      · {humanize(entry.status)}
                    </dd>
                  </div>
                ))}
              </MetaGrid>
            )}
          </Card>

          {canRunAi ? (
            <Card>
              <CardHead>
                <div>
                  <CardTitle>AI client brief</CardTitle>
                  <CardText>
                    Drafts an internal summary only. It never sends anything to the
                    client, promises dates or changes records.
                  </CardText>
                </div>
                <Bot size={16} aria-hidden="true" />
              </CardHead>
              <Stack $gap={10}>
                <Field>
                  <Label htmlFor="client-ai-instruction">Focus (optional)</Label>
                  <Textarea
                    id="client-ai-instruction"
                    value={aiInstruction}
                    onChange={(event) => setAiInstruction(event.target.value)}
                    maxLength={1_000}
                    style={{ minHeight: 60 }}
                    placeholder="Summarise open risks and renewal timing."
                    disabled={aiBusy}
                  />
                </Field>
                <Actions>
                  <Button type="button" $variant="primary" onClick={requestBrief} disabled={aiBusy}>
                    {aiBusy ? <Loader2 size={14} className="spin" /> : <Bot size={14} />}
                    {aiBusy ? 'Queuing…' : 'Draft brief'}
                  </Button>
                </Actions>
              </Stack>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'contacts' ? (
        <>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Contacts</CardTitle>
                <CardText>People attached to this client relationship.</CardText>
              </div>
              <Users size={16} aria-hidden="true" />
            </CardHead>
            {contacts.length === 0 ? (
              <CardText>No contacts recorded yet.</CardText>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Primary</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => (
                      <tr key={contact.id}>
                        <td>{contact.name}</td>
                        <td>{contact.title || '—'}</td>
                        <td>{contact.email || '—'}</td>
                        <td>{contact.phone || '—'}</td>
                        <td>{contact.isPrimary ? 'Yes' : 'No'}</td>
                        <td>
                          {permissions.canEdit ? (
                            <Button
                              type="button"
                              $variant="ghost"
                              onClick={() => {
                                setContactCreating(false);
                                setContactEditing(contact);
                              }}
                            >
                              Edit
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
            {permissions.canEdit ? (
              <Actions>
                <Button
                  type="button"
                  onClick={() => {
                    setContactEditing(null);
                    setContactCreating((current) => !current);
                  }}
                >
                  <Plus size={14} />
                  Add contact
                </Button>
              </Actions>
            ) : null}
          </Card>

          {contactCreating || contactEditing ? (
            <Card>
              <CardHead>
                <div>
                  <CardTitle>{contactEditing ? 'Edit contact' : 'New contact'}</CardTitle>
                  <CardText>Only one contact can be primary per client.</CardText>
                </div>
                <Users size={16} aria-hidden="true" />
              </CardHead>
              <ContactForm
                clientId={client.id}
                contact={contactEditing}
                onDone={() => {
                  setContactCreating(false);
                  setContactEditing(null);
                  setNotice('Contact saved.');
                  refresh();
                }}
                onCancel={() => {
                  setContactCreating(false);
                  setContactEditing(null);
                }}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'engagements' ? (
        <>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Service engagements</CardTitle>
                <CardText>
                  Ongoing services tied to the catalogue, proposals and projects.
                  Not every service is recurring.
                </CardText>
              </div>
              <CalendarClock size={16} aria-hidden="true" />
            </CardHead>
            {engagements.length === 0 ? (
              <CardText>No engagements recorded for this client.</CardText>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Engagement</th>
                      <th>Status</th>
                      <th>Frequency</th>
                      <th>Manager</th>
                      <th>Renewal</th>
                      <th>Value</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {engagements.map((entry) => {
                      const status = metaFor(ENGAGEMENT_STATUS_META, entry.status);
                      return (
                        <tr key={entry.id}>
                          <td>
                            {entry.name}
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                              {entry.serviceName || 'No catalogue link'}
                              {entry.projectId ? ' · project linked' : ''}
                            </div>
                          </td>
                          <td>
                            <Badge $tone={status.tone}>{status.label}</Badge>
                          </td>
                          <td>{ENGAGEMENT_FREQUENCY_LABELS[entry.frequency] || entry.frequency}</td>
                          <td>{entry.managerName || 'Unassigned'}</td>
                          <td>{formatDate(entry.renewalDate, timezone)}</td>
                          <td>{formatMoney(entry.contractValueCents, entry.currency)}</td>
                          <td>
                            {permissions.canEdit ? (
                              <Button
                                type="button"
                                $variant="ghost"
                                onClick={() => {
                                  setEngagementCreating(false);
                                  setEngagementEditing(entry);
                                }}
                              >
                                Edit
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
            {permissions.canEdit ? (
              <Actions>
                <Button
                  type="button"
                  onClick={() => {
                    setEngagementEditing(null);
                    setEngagementCreating((current) => !current);
                  }}
                >
                  <Plus size={14} />
                  New engagement
                </Button>
              </Actions>
            ) : null}
          </Card>

          {engagementCreating || engagementEditing ? (
            <Card>
              <CardHead>
                <div>
                  <CardTitle>
                    {engagementEditing ? 'Edit engagement' : 'New engagement'}
                  </CardTitle>
                  <CardText>
                    Status changes after creation follow the controlled lifecycle.
                  </CardText>
                </div>
                <CalendarClock size={16} aria-hidden="true" />
              </CardHead>
              <EngagementForm
                engagement={engagementEditing}
                clients={[{ id: client.id, companyName: client.companyName }]}
                linkOptions={linkOptions}
                members={members}
                fixedClientId={client.id}
                onDone={() => {
                  setEngagementCreating(false);
                  setEngagementEditing(null);
                  setNotice('Engagement saved.');
                  refresh();
                }}
                onCancel={() => {
                  setEngagementCreating(false);
                  setEngagementEditing(null);
                }}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'tickets' ? (
        <>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Support tickets</CardTitle>
                <CardText>Every ticket records its own visible and internal history.</CardText>
              </div>
              <LifeBuoy size={16} aria-hidden="true" />
            </CardHead>
            {tickets.length === 0 ? (
              <CardText>No tickets recorded for this client.</CardText>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Category</th>
                      <th>Assignee</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((entry) => {
                      const status = metaFor(TICKET_STATUS_META, entry.status);
                      const priority = metaFor(TICKET_PRIORITY_META, entry.priority);
                      return (
                        <tr key={entry.id}>
                          <td>
                            <Link href={`/workspace/support/${entry.id}`}>
                              {entry.reference}
                            </Link>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                              {entry.subject}
                            </div>
                          </td>
                          <td>
                            <Badge $tone={status.tone}>{status.label}</Badge>
                          </td>
                          <td>
                            <Badge $tone={priority.tone}>{priority.label}</Badge>
                          </td>
                          <td>{TICKET_CATEGORY_LABELS[entry.category] || entry.category}</td>
                          <td>{entry.assignedName || 'Unassigned'}</td>
                          <td>{formatDate(entry.dueDate, timezone)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
            {canCreateTicket ? (
              <Actions>
                <Button
                  type="button"
                  onClick={() => setTicketCreating((current) => !current)}
                >
                  <Plus size={14} />
                  New ticket
                </Button>
              </Actions>
            ) : null}
          </Card>

          {ticketCreating ? (
            <Card>
              <CardHead>
                <div>
                  <CardTitle>New support ticket</CardTitle>
                  <CardText>The client is fixed to this record.</CardText>
                </div>
                <LifeBuoy size={16} aria-hidden="true" />
              </CardHead>
              <TicketForm
                clients={[{ id: client.id, companyName: client.companyName }]}
                projects={projects}
                members={members}
                fixedClientId={client.id}
                onDone={(result) => {
                  setTicketCreating(false);
                  setNotice('Ticket created.');
                  if (result?.ticket?.id) {
                    router.push(`/workspace/support/${result.ticket.id}`);
                  } else {
                    refresh();
                  }
                }}
                onCancel={() => setTicketCreating(false)}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'billing' ? (
        <>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Billing summary</CardTitle>
                <CardText>
                  Applies only to issued invoices. Proposals and accepted scope are
                  not revenue.
                </CardText>
              </div>
              <Receipt size={16} aria-hidden="true" />
            </CardHead>
            <MetaGrid>
              <div>
                <dt>Issued invoices</dt>
                <dd>{billing.invoiceCount}</dd>
              </div>
              <div>
                <dt>Invoiced total</dt>
                <dd>{formatMoney(billing.issuedTotalCents, billingCurrency)}</dd>
              </div>
              <div>
                <dt>Paid against invoices</dt>
                <dd>{formatMoney(billing.paidTotalCents, billingCurrency)}</dd>
              </div>
              <div>
                <dt>Outstanding</dt>
                <dd>{formatMoney(billing.outstandingCents, billingCurrency)}</dd>
              </div>
              <div>
                <dt>Cash collected</dt>
                <dd>{formatMoney(billing.collectedCents, billingCurrency)}</dd>
              </div>
              <div>
                <dt>Payments recorded</dt>
                <dd>{billing.paymentCount}</dd>
              </div>
            </MetaGrid>
            <Hint>
              Grouped totals assume a single currency. Open an invoice to see its
              own currency.
            </Hint>
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Recent invoices</CardTitle>
                <CardText>Issued financial documents are never silently rewritten.</CardText>
              </div>
              <Receipt size={16} aria-hidden="true" />
            </CardHead>
            {billing.recentInvoices.length === 0 ? (
              <CardText>No invoices recorded yet.</CardText>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Due</th>
                      <th>Total</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billing.recentInvoices.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <Link href={`/workspace/finance/invoices/${entry.id}`}>
                            {entry.reference}
                          </Link>
                        </td>
                        <td>{humanize(entry.status)}</td>
                        <td>{formatDate(entry.invoiceDate, timezone)}</td>
                        <td>{formatDate(entry.dueDate, timezone)}</td>
                        <td>{formatMoney(entry.totalCents, entry.currency)}</td>
                        <td>{formatMoney(entry.balanceDueCents, entry.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Recent payments</CardTitle>
                <CardText>Only manually recorded payments with evidence appear here.</CardText>
              </div>
              <Receipt size={16} aria-hidden="true" />
            </CardHead>
            {billing.recentPayments.length === 0 ? (
              <CardText>No payments recorded yet.</CardText>
            ) : (
              <MetaGrid>
                {billing.recentPayments.map((entry) => (
                  <div key={entry.id}>
                    <dt>{entry.reference}</dt>
                    <dd>
                      {formatMoney(entry.amountCents, entry.currency)} ·{' '}
                      {formatDate(entry.paymentDate, timezone)}
                      {entry.invoiceReference ? ` · ${entry.invoiceReference}` : ''}
                    </dd>
                  </div>
                ))}
              </MetaGrid>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'timeline' ? (
        <>
          {permissions.canEdit ? (
            <Card>
              <CardHead>
                <div>
                  <CardTitle>Record an interaction</CardTitle>
                  <CardText>
                    Meetings, calls and emails are recorded manually. Nothing here
                    claims an email or call was sent by the system.
                  </CardText>
                </div>
                <NotebookPen size={16} aria-hidden="true" />
              </CardHead>
              <TimelineEntryForm clientId={client.id} onDone={refresh} />
            </Card>
          ) : null}

          <Card>
            <CardHead>
              <div>
                <CardTitle>Unified timeline</CardTitle>
                <CardText>
                  Recorded interactions plus project, proposal, support and billing
                  events.
                </CardText>
              </div>
              <CalendarClock size={16} aria-hidden="true" />
            </CardHead>
            {timeline.length === 0 ? (
              <CardText>No history recorded yet.</CardText>
            ) : (
              <Timeline>
                {timeline.map((event) => (
                  <TimelineItem key={event.id}>
                    <strong>
                      {TIMELINE_SOURCE_LABELS[event.source] || humanize(event.source)} ·{' '}
                      {eventLabel(event)}
                    </strong>
                    <p>{event.title}</p>
                    {event.body ? <p>{event.body}</p> : null}
                    <span>
                      {formatDateTime(event.occurredAt, timezone)}
                      {event.actorName ? ` · ${event.actorName}` : ''}
                    </span>
                  </TimelineItem>
                ))}
              </Timeline>
            )}
          </Card>
        </>
      ) : null}

      <Hint>
        <CircleAlert size={12} aria-hidden="true" /> Relationship history is
        append-only for manual entries and never rewrites accepted proposals.
        Support messages marked internal stay internal.
      </Hint>
    </Page>
  );
}
