'use client';

import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';

export default function ProposalPrintBar({ backHref }) {
  return (
    <div className="proposal-no-print" style={barStyle}>
      <Link href={backHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={14} /> Back to proposal
      </Link>
      <button type="button" style={buttonStyle} onClick={() => window.print()}>
        <Printer size={14} /> Print or save as PDF
      </button>
      <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
        Printing uses the browser dialog. Nothing is stored or sent automatically.
      </span>
    </div>
  );
}

const barStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 14,
  padding: '12px 16px',
  marginBottom: 18,
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
};

const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #1d4ed8',
  background: '#1d4ed8',
  color: '#ffffff',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
};
