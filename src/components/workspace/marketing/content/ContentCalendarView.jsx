'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import {
  Badge,
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
  Stack,
  Title,
} from '@/components/workspace/ai/primitives';
import { SmallLink } from '@/components/workspace/phase2c/ui';
import { CONTENT_TYPE_LABELS } from '@/lib/marketing/constants';
import MarketingNav from '../MarketingNav';
import { CONTENT_STATUS_META, dateInputValue, metaFor } from '../meta';

function monthLabel(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function shiftMonth(month, delta) {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function groupByDay(items) {
  const groups = new Map();
  for (const item of items) {
    const key = dateInputValue(item.scheduledFor);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export default function ContentCalendarView({ content, month }) {
  const groups = groupByDay(content.items);
  return (
    <Page>
      <Header>
        <Eyebrow>Internal calendar</Eyebrow>
        <Title>Content plan — {monthLabel(month)}</Title>
        <Lead>
          Dates are planning entries in this workspace. A scheduled item is not a
          published post, and nothing is sent to a social network or website.
        </Lead>
      </Header>
      <MarketingNav />

      <Card>
        <CardHead>
          <div>
            <CardTitle>{monthLabel(month)}</CardTitle>
            <CardText>
              {content.total} scheduled item(s) in this month. Showing up to{' '}
              {content.pageSize}.
            </CardText>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SmallLink href={`/workspace/marketing/calendar?month=${shiftMonth(month, -1)}`}>
              ← Previous
            </SmallLink>
            <SmallLink href={`/workspace/marketing/calendar?month=${shiftMonth(month, 1)}`}>
              Next →
            </SmallLink>
            <LinkButton href="/workspace/marketing/content">List view</LinkButton>
          </div>
        </CardHead>

        {groups.length === 0 ? (
          <EmptyState>
            <CalendarDays size={17} aria-hidden="true" />
            <div>
              <h3>No content is scheduled this month</h3>
              <p>
                Approve content first, then schedule it to a date. Scheduling is
                reversible and never publishes.
              </p>
            </div>
          </EmptyState>
        ) : (
          <Stack $gap={16}>
            {groups.map(([day, items]) => (
              <div key={day}>
                <Hint>{day}</Hint>
                <Stack $gap={8}>
                  {items.map((item) => {
                    const status = metaFor(CONTENT_STATUS_META, item.status);
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          border: '1px solid #E5EAF1',
                          borderRadius: 10,
                          background: '#FFFFFF',
                        }}
                      >
                        <Badge $tone={status.tone}>{status.label}</Badge>
                        <Link href={`/workspace/marketing/content/${item.id}`}>
                          {item.title}
                        </Link>
                        <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
                          {item.clientName} ·{' '}
                          {CONTENT_TYPE_LABELS[item.contentType] || item.contentType}
                          {item.ownerName ? ` · ${item.ownerName}` : ''}
                        </span>
                      </div>
                    );
                  })}
                </Stack>
              </div>
            ))}
          </Stack>
        )}
        {content.pages > 1 ? (
          <Hint>
            This view lists the first page of scheduled content. Use the list
            view to page through older or newer items.
          </Hint>
        ) : null}
      </Card>
    </Page>
  );
}
