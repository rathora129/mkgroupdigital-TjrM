'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Globe2, Plus, Search } from 'lucide-react';
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
  LinkButton,
  Page,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import { FilterBar, FilterField } from '@/components/workspace/phase2c/ui';
import { formatDateTime } from '@/lib/ai/format';
import MarketingNav from '../MarketingNav';
import { PROPOSAL_STATUS_META, metaFor } from '../meta';

export default function WebsiteView({
  pages,
  proposals,
  clients,
  query,
  canManage,
  timezone,
}) {
  const router = useRouter();

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const search = new URLSearchParams();
    const text = String(data.get('search') || '').trim();
    const clientId = String(data.get('clientId') || '');
    if (text) search.set('search', text);
    if (clientId) search.set('clientId', clientId);
    const suffix = search.toString();
    router.push(
      suffix ? `/workspace/marketing/website?${suffix}` : '/workspace/marketing/website',
    );
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Website change manager</Eyebrow>
        <Title>Page inventory and change proposals</Title>
        <Lead>
          Keep the original content beside every proposal. Approval does not edit
          a website; an executed proposal requires manually recorded evidence.
        </Lead>
      </Header>
      <MarketingNav />

      <Card>
        <CardHead>
          <div>
            <CardTitle>Page inventory</CardTitle>
            <CardText>
              {pages.total} page(s) tracked. Original notes stay unchanged when a
              proposal is written.
            </CardText>
          </div>
          <Actions>
            {canManage ? (
              <LinkButton href="/workspace/marketing/website/pages/new" $primary>
                <Plus size={15} />
                Add page
              </LinkButton>
            ) : null}
          </Actions>
        </CardHead>

        <FilterBar onSubmit={submitFilters}>
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Page title, URL or client"
            />
          </FilterField>
          <FilterField>
            <span>Client</span>
            <select name="clientId" defaultValue={query.clientId || ''}>
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </select>
          </FilterField>
          <Actions>
            <Button type="submit">
              <Search size={14} />
              Apply
            </Button>
            <Button
              type="button"
              $variant="ghost"
              onClick={() => router.push('/workspace/marketing/website')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {pages.items.length === 0 ? (
          <EmptyState>
            <Globe2 size={17} aria-hidden="true" />
            <div>
              <h3>No pages in the inventory</h3>
              <p>
                Add a page to track its objective and existing content before
                proposing changes.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Proposals</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {pages.items.map((page) => (
                  <tr key={page.id}>
                    <td>
                      <strong>{page.pageTitle}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {page.pageUrl}
                      </div>
                    </td>
                    <td>{page.clientName}</td>
                    <td>{page.pageType || '—'}</td>
                    <td>{page.proposalCount}</td>
                    <td>{formatDateTime(page.updatedAt, timezone)}</td>
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
            <CardTitle>Change proposals</CardTitle>
            <CardText>
              {proposals.total} proposal(s). Review, approval and execution are
              separate recorded steps.
            </CardText>
          </div>
          <Actions>
            {canManage ? (
              <LinkButton href="/workspace/marketing/website/proposals/new" $primary>
                <Plus size={15} />
                New proposal
              </LinkButton>
            ) : null}
          </Actions>
        </CardHead>

        {proposals.items.length === 0 ? (
          <EmptyState>
            <Globe2 size={17} aria-hidden="true" />
            <div>
              <h3>No change proposals</h3>
              <p>
                Proposals are written against a page in the inventory. Nothing is
                applied automatically.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Client</th>
                  <th>Page</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {proposals.items.map((proposal) => {
                  const status = metaFor(PROPOSAL_STATUS_META, proposal.status);
                  return (
                    <tr key={proposal.id}>
                      <td>
                        <Link
                          href={`/workspace/marketing/website/proposals/${proposal.id}`}
                        >
                          {proposal.title}
                        </Link>
                      </td>
                      <td>{proposal.clientName}</td>
                      <td>{proposal.pageUrl || '—'}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>{proposal.ownerName || 'Unassigned'}</td>
                      <td>{formatDateTime(proposal.updatedAt, timezone)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Hint>
        This module never writes to a live website, CMS, DNS record or hosting
        provider. Execution is recorded manually after someone makes the change.
      </Hint>
    </Page>
  );
}
