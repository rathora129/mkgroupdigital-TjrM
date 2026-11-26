'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Search, Settings2 } from 'lucide-react';
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
  Header,
  Hint,
  Lead,
  Page,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import MarketingNav from '../MarketingNav';

const KEYS = ['search', 'hasProfile', 'page'];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/workspace/marketing/clients?${text}` : '/workspace/marketing/clients';
}

export default function MarketingClientsView({ clients, query, canManage }) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = clients;
  const missingProfiles = items.filter((item) => !item.hasProfile).length;

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const overrides = {
      search: String(data.get('search') || '').trim() || undefined,
      hasProfile: query.hasProfile,
    };
    router.push(listHref(overrides));
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Marketing setup</Eyebrow>
        <Title>Client marketing profiles</Title>
        <Lead>
          One profile per client records the business context, audience,
          services and voice used for planning. Clients come from the shared
          client list; this module never creates duplicates.
        </Lead>
      </Header>
      <MarketingNav />

      <Card>
        <CardHead>
          <div>
            <CardTitle>Clients</CardTitle>
            <CardText>
              {total} client(s) match the filters. {missingProfiles} on this page
              have no marketing profile yet.
            </CardText>
          </div>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip href={listHref(query, { hasProfile: undefined })} $active={!query.hasProfile}>
            All clients
          </FilterChip>
          <FilterChip
            href={listHref(query, { hasProfile: 'yes' })}
            $active={query.hasProfile === 'yes'}
          >
            Profile configured
          </FilterChip>
          <FilterChip
            href={listHref(query, { hasProfile: 'no' })}
            $active={query.hasProfile === 'no'}
          >
            Needs setup
          </FilterChip>
        </div>

        <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Company, reference or industry"
            />
          </FilterField>
          <Actions>
            <Button type="submit">
              <Search size={14} />
              Apply
            </Button>
            <Button
              type="button"
              $variant="ghost"
              onClick={() => router.push('/workspace/marketing/clients')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Building2 size={17} aria-hidden="true" />
            <div>
              <h3>No clients match these filters</h3>
              <p>
                Create the client in the shared Clients module first, then
                configure its marketing profile here.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Profile</th>
                  <th>Services</th>
                  <th>Campaigns</th>
                  <th>Open content</th>
                  <th>Website proposals</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/workspace/marketing/clients/${item.id}`}>
                        {item.companyName}
                      </Link>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {item.reference}
                        {item.industry ? ` · ${item.industry}` : ''}
                      </div>
                    </td>
                    <td>
                      {item.hasProfile ? (
                        <Badge $tone="success">Configured</Badge>
                      ) : (
                        <Badge $tone="muted">Not set up</Badge>
                      )}
                    </td>
                    <td>
                      {item.selectedServices.length === 0
                        ? '—'
                        : `${item.selectedServices.length} selected`}
                    </td>
                    <td>{item.campaignCount}</td>
                    <td>{item.openContentCount}</td>
                    <td>{item.pendingProposalCount} awaiting review</td>
                    <td>
                      <Link href={`/workspace/marketing/clients/${item.id}`}>
                        <Settings2 size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}

        <ListPager
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
          hrefFor={(target) => listHref(query, { page: target })}
        />
      </Card>

      <Hint>
        {canManage
          ? 'Editing a profile records an audit entry. Campaigns, content and website changes are separate records linked to this client.'
          : 'You can review marketing profiles, but your role cannot edit them.'}
      </Hint>
    </Page>
  );
}
