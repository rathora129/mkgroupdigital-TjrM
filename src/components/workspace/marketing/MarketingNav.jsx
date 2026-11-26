'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styled from 'styled-components';
import { workspaceMedia } from '@/styles/workspaceTheme';

export const MARKETING_TABS = [
  { href: '/workspace/marketing', label: 'Overview', exact: true },
  { href: '/workspace/marketing/clients', label: 'Client setup' },
  { href: '/workspace/marketing/campaigns', label: 'Campaigns' },
  { href: '/workspace/marketing/content', label: 'Content' },
  { href: '/workspace/marketing/calendar', label: 'Calendar' },
  { href: '/workspace/marketing/website', label: 'Website' },
  { href: '/workspace/marketing/audits', label: 'SEO findings' },
  { href: '/workspace/marketing/reports', label: 'Performance' },
];

const Bar = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surfaceRaised};

  @media ${workspaceMedia.down('tablet')} {
    flex-wrap: nowrap;
    overflow-x: auto;
  }
`;

const Tab = styled(Link)`
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.muted};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primarySoft : 'transparent'};
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

export default function MarketingNav() {
  const pathname = usePathname() || '';
  return (
    <Bar aria-label="Marketing sections">
      {MARKETING_TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Tab key={tab.href} href={tab.href} $active={active}>
            {tab.label}
          </Tab>
        );
      })}
    </Bar>
  );
}
