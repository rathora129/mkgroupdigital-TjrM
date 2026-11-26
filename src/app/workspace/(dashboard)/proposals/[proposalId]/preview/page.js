import { notFound } from 'next/navigation';
import ProposalPrintBar from '@/components/workspace/proposals/ProposalPrintBar';
import { requirePermissionPage } from '@/lib/auth/authorization';
import {
  buildProposalDocument,
  recordProposalExport,
} from '@/lib/proposals/service';
import { isUuid } from '@/lib/proposals/validation';
import { formatMoney, statusMeta } from '@/components/workspace/proposals/meta';
import { formatDate } from '@/lib/ai/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Proposal preview',
};

const PRINT_CSS = `
  @page { margin: 16mm; }
  @media print {
    body * { visibility: hidden !important; }
    #proposal-print, #proposal-print * { visibility: visible !important; }
    #proposal-print { position: absolute; left: 0; top: 0; width: 100%; }
    .proposal-no-print { display: none !important; }
  }
`;

export default async function ProposalPreviewPage({ params }) {
  const viewer = await requirePermissionPage('proposals.export');
  const { proposalId } = await params;
  if (!isUuid(proposalId)) notFound();

  const workspaceId = viewer.membership.workspaceId;
  const document = await buildProposalDocument(workspaceId, proposalId);
  if (!document) notFound();

  await recordProposalExport({
    workspaceId,
    userId: viewer.user.id,
    proposalId,
  });

  const timezone = viewer.workspace.timezone || 'UTC';
  const currency = document.version.currency || 'INR';
  const brand = document.workspace?.brandColor || '#1d4ed8';
  const status = statusMeta(document.displayStatus);

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '18px 16px 48px' }}>
      <style>{PRINT_CSS}</style>
      <ProposalPrintBar backHref={`/workspace/proposals/${proposalId}`} />

      <article id="proposal-print" style={pageStyle}>
        <header style={headerStyle}>
          <div>
            {document.workspace?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={document.workspace.logoUrl}
                alt={document.workspace.name || 'Workspace logo'}
                style={{ height: 44, width: 'auto', marginBottom: 8 }}
              />
            ) : null}
            <h1 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>
              {document.workspace?.name || 'Workspace'}
            </h1>
            <div style={mutedStyle}>
              {[document.workspace?.businessEmail, document.workspace?.businessPhone]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {document.workspace?.businessAddress ? (
              <div style={mutedStyle}>{document.workspace.businessAddress}</div>
            ) : null}
            {document.workspace?.websiteUrl ? (
              <div style={mutedStyle}>{document.workspace.websiteUrl}</div>
            ) : null}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>
              Commercial proposal
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
              {document.reference}
            </div>
            <div style={mutedStyle}>Version {document.versionNumber}</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ ...badgeStyle, color: brand, borderColor: brand }}>
                {status.label}
              </span>
            </div>
          </div>
        </header>

        <div style={{ height: 4, borderRadius: 2, background: brand, margin: '14px 0 18px' }} />

        {!document.isClientFacing ? (
          <p style={warningStyle}>
            Internal preview. This version has not been approved or sent to the
            client, and this document does not record acceptance.
          </p>
        ) : null}

        <h2 style={titleStyle}>{document.proposal.title}</h2>
        <p style={{ ...mutedStyle, marginTop: 4 }}>
          Prepared for {document.client.companyName || 'the client'}
          {document.client.contactName ? ` · ${document.client.contactName}` : ''}
          {document.client.email ? ` · ${document.client.email}` : ''}
        </p>
        <p style={mutedStyle}>
          Opportunity: {document.client.opportunityTitle || '—'} · Valid until{' '}
          {formatDate(document.version.validityDate, timezone)} · Sales owner{' '}
          {document.proposal.salesOwnerName || '—'}
        </p>

        <section style={summaryRowStyle}>
          <SummaryBox label="One-time total" value={formatMoney(document.summary.oneTimeTotalCents, currency)} />
          <SummaryBox label="Monthly recurring" value={formatMoney(document.summary.recurringMonthlyCents, currency)} />
          <SummaryBox label="Quarterly recurring" value={formatMoney(document.summary.recurringQuarterlyCents, currency)} />
          <SummaryBox label="Annual recurring" value={formatMoney(document.summary.recurringAnnualCents, currency)} />
          {document.summary.optionalTotalCents > 0 ? (
            <SummaryBox label="Optional add-ons" value={formatMoney(document.summary.optionalTotalCents, currency)} />
          ) : null}
        </section>
        <p style={mutedStyle}>
          Recurring amounts are quoted per period and are never combined with the
          one-time total.
        </p>

        {document.sections.map((section) => (
          <section key={section.key} style={sectionStyle}>
            <h3 style={sectionTitleStyle}>{section.label}</h3>
            <p style={bodyStyle}>{section.content}</p>
          </section>
        ))}

        {document.deliverables.length > 0 ? (
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Deliverables</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Deliverable</th>
                  <th style={thStyle}>Expected completion</th>
                  <th style={thStyle}>Details</th>
                </tr>
              </thead>
              <tbody>
                {document.deliverables.map((entry) => (
                  <tr key={entry.id}>
                    <td style={tdStyle}>{entry.title}</td>
                    <td style={tdStyle}>{entry.expectedCompletion || '—'}</td>
                    <td style={tdStyle}>{entry.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {document.milestones.length > 0 ? (
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Milestones</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Milestone</th>
                  <th style={thStyle}>Expected period</th>
                  <th style={thStyle}>Details</th>
                </tr>
              </thead>
              <tbody>
                {document.milestones.map((entry) => (
                  <tr key={entry.id}>
                    <td style={tdStyle}>{entry.title}</td>
                    <td style={tdStyle}>{entry.expectedCompletion || '—'}</td>
                    <td style={tdStyle}>{entry.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {document.groups.map((group) => (
          <section key={group.key} style={sectionStyle}>
            <h3 style={sectionTitleStyle}>{group.label}</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Service</th>
                  <th style={thStyle}>Qty</th>
                  <th style={thStyle}>Unit price</th>
                  <th style={thStyle}>Discount</th>
                  <th style={thStyle}>Tax</th>
                  <th style={thStyle}>Total</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((line) => (
                  <tr key={line.id}>
                    <td style={tdStyle}>
                      <strong>{line.name}</strong>
                      {line.scope ? (
                        <div style={mutedStyle}>{line.scope}</div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>
                      {line.quantity} {line.unit}
                    </td>
                    <td style={tdStyle}>{formatMoney(line.unitPriceCents, currency)}</td>
                    <td style={tdStyle}>{formatMoney(line.lineDiscountCents, currency)}</td>
                    <td style={tdStyle}>{formatMoney(line.lineTaxCents, currency)}</td>
                    <td style={tdStyle}>{formatMoney(line.lineTotalCents, currency)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={tdStyle} colSpan={5}>
                    Subtotal {formatMoney(group.totals.subtotalCents, currency)} · Discounts{' '}
                    {formatMoney(group.totals.discountTotalCents, currency)} · CGST{' '}
                    {formatMoney(group.totals.cgstCents, currency)} · SGST{' '}
                    {formatMoney(group.totals.sgstCents, currency)} · IGST{' '}
                    {formatMoney(group.totals.igstCents, currency)}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>
                    {formatMoney(group.totals.totalCents, currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        ))}

        {document.optionalLines.length > 0 ? (
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Optional add-ons</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Service</th>
                  <th style={thStyle}>Qty</th>
                  <th style={thStyle}>Total</th>
                </tr>
              </thead>
              <tbody>
                {document.optionalLines.map((line) => (
                  <tr key={line.id}>
                    <td style={tdStyle}>{line.name}</td>
                    <td style={tdStyle}>
                      {line.quantity} {line.unit}
                    </td>
                    <td style={tdStyle}>{formatMoney(line.lineTotalCents, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={mutedStyle}>
              Optional items are not included in any contract total.
            </p>
          </section>
        ) : null}

        {document.excludedLines.length > 0 ? (
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Explicitly excluded</h3>
            <ul style={listStyle}>
              {document.excludedLines.map((line) => (
                <li key={line.id}>{line.name}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {document.disclosures.length > 0 ? (
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Regulated professional services</h3>
            <ul style={listStyle}>
              {document.disclosures.map((entry) => (
                <li key={entry.line}>
                  <strong>{entry.line}</strong> — professional review by {entry.profession}.
                  {entry.notes ? ` ${entry.notes}` : ''}
                </li>
              ))}
            </ul>
            <p style={mutedStyle}>
              Statutory review, certification, signing and filing are performed
              by the named qualified professional.
            </p>
          </section>
        ) : null}

        <p style={{ ...mutedStyle, marginTop: 22, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
          {document.notice}
        </p>
        <p style={mutedStyle}>
          Generated {formatDate(document.generatedAt, timezone)} · {document.reference} ·
          Version {document.versionNumber} · Proposal only, not an invoice.
        </p>
      </article>
    </div>
  );
}

function SummaryBox({ label, value }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', background: '#f8fafc' }}>
      <div style={{ fontSize: '0.66rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

const pageStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: '26px 28px',
  color: '#1e293b',
  fontSize: '0.86rem',
  lineHeight: 1.65,
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 24,
  flexWrap: 'wrap',
};

const mutedStyle = { margin: 0, fontSize: '0.76rem', color: '#64748b' };

const badgeStyle = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 999,
  border: '1px solid #cbd5e1',
  fontSize: '0.72rem',
  fontWeight: 700,
};

const warningStyle = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #fcd34d',
  background: '#fffbeb',
  color: '#92400e',
  fontSize: '0.78rem',
};

const titleStyle = { margin: '4px 0 0', fontSize: '1.35rem', color: '#0f172a' };

const summaryRowStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 8,
  margin: '14px 0 6px',
};

const sectionStyle = { marginTop: 20, breakInside: 'avoid' };

const sectionTitleStyle = {
  margin: '0 0 6px',
  fontSize: '0.8rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#334155',
};

const bodyStyle = { margin: 0, whiteSpace: 'pre-wrap' };

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.78rem',
};

const thStyle = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid #cbd5e1',
  background: '#f1f5f9',
  color: '#334155',
};

const tdStyle = {
  padding: '6px 8px',
  borderBottom: '1px solid #e2e8f0',
  verticalAlign: 'top',
};

const listStyle = { margin: 0, paddingLeft: 18 };
