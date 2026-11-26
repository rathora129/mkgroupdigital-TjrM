'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Check, CheckCheck, Inbox } from 'lucide-react';
import styled from 'styled-components';
import {
  Actions,
  Badge,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  Header,
  Lead,
  LinkButton,
  Notice,
  Page,
  Stack,
  Title,
} from '@/components/workspace/ai/primitives';
import { FilterChip, ListPager } from '@/components/workspace/phase2c/ui';
import { formatDateTime } from '@/lib/ai/format';
import { apiRequest } from '@/lib/ai/client';

const LEVEL_META = {
  info: { label: 'Info', tone: 'info' },
  success: { label: 'Success', tone: 'success' },
  warning: { label: 'Warning', tone: 'warning' },
  danger: { label: 'Action needed', tone: 'danger' },
};

const TYPE_LABELS = {
  follow_up_due: 'Follow-up due',
  follow_up_overdue: 'Follow-up overdue',
  meeting_scheduled: 'Meeting scheduled',
  meeting_reminder: 'Meeting reminder',
  lead_assigned: 'Lead assigned',
  discovery_review: 'Discovery review',
  calendar_unavailable: 'Calendar unavailable',
};

const NotificationRow = styled(Card)`
  gap: 10px;
  border-left: 3px solid
    ${({ theme, $unread }) =>
      $unread ? theme.colors.primary : theme.colors.border};
`;

const RowHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const RowTitle = styled.p`
  font-size: 0.9rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const RowMeta = styled.p`
  margin-top: 3px;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const RowBody = styled.p`
  font-size: 0.82rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSoft};
`;

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

function hrefFor(page, unreadOnly) {
  const search = new URLSearchParams();
  if (unreadOnly) search.set('unread', '1');
  if (page > 1) search.set('page', String(page));
  const text = search.toString();
  return text ? `/workspace/notifications?${text}` : '/workspace/notifications';
}

export default function NotificationsView({ data, unreadOnly, timezone }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);

  const { items, total, allTotal, unreadTotal, page, pages, pageSize } = data;

  async function markRead(notificationId) {
    setBusyId(notificationId);
    setFailure(null);
    try {
      await apiRequest(`/api/workforce/notifications/${notificationId}`, {
        method: 'PATCH',
      });
      router.refresh();
    } catch (error) {
      setFailure(error?.message || 'The notification could not be updated.');
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    setFailure(null);
    setNotice(null);
    try {
      const result = await apiRequest('/api/workforce/notifications/read-all', {
        method: 'POST',
      });
      setNotice(
        result.updated
          ? `${result.updated} notification${result.updated === 1 ? '' : 's'} marked as read.`
          : 'There were no unread notifications.',
      );
      router.refresh();
    } catch (error) {
      setFailure(error?.message || 'Notifications could not be updated.');
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Notification centre</Eyebrow>
        <Title>Notifications</Title>
        <Lead>
          Reminders, lead assignments and meeting updates addressed to you. Only
          notifications for your own workspace membership appear here.
        </Lead>
      </Header>

      <Stack $gap={14}>
        <FilterRow>
          <FilterChip href={hrefFor(1, false)} $active={!unreadOnly}>
            All ({allTotal})
          </FilterChip>
          <FilterChip href={hrefFor(1, true)} $active={unreadOnly}>
            Unread ({unreadTotal})
          </FilterChip>
          <Button
            type="button"
            $variant="ghost"
            onClick={markAllRead}
            disabled={markingAll || unreadTotal === 0}
          >
            <CheckCheck size={15} />
            {markingAll ? 'Marking…' : 'Mark all as read'}
          </Button>
        </FilterRow>

        {failure ? <Notice $tone="danger">{failure}</Notice> : null}
        {notice ? <Notice $tone="success">{notice}</Notice> : null}

        {items.length === 0 ? (
          <EmptyState>
            <Inbox size={22} aria-hidden="true" />
            <p>
              {unreadOnly
                ? 'You have no unread notifications.'
                : 'No notifications yet. Follow-up reminders, assignments and meeting updates will appear here.'}
            </p>
          </EmptyState>
        ) : (
          <Stack $gap={10}>
            {items.map((item) => {
              const level = LEVEL_META[item.level] || LEVEL_META.info;
              return (
                <NotificationRow key={item.id} $unread={item.unread}>
                  <RowHead>
                    <div>
                      <RowTitle>{item.title}</RowTitle>
                      <RowMeta>
                        {TYPE_LABELS[item.type] || item.type} ·{' '}
                        {formatDateTime(item.createdAt, timezone)}
                      </RowMeta>
                    </div>
                    <Badge $tone={level.tone}>{level.label}</Badge>
                  </RowHead>
                  {item.body ? <RowBody>{item.body}</RowBody> : null}
                  <Actions>
                    {item.actionUrl ? (
                      <LinkButton href={item.actionUrl}>
                        <BellRing size={14} />
                        Open
                      </LinkButton>
                    ) : null}
                    {item.unread ? (
                      <Button
                        type="button"
                        onClick={() => markRead(item.id)}
                        disabled={busyId === item.id || markingAll}
                      >
                        <Check size={14} />
                        {busyId === item.id ? 'Saving…' : 'Mark as read'}
                      </Button>
                    ) : (
                      <Badge $tone="muted">Read</Badge>
                    )}
                  </Actions>
                </NotificationRow>
              );
            })}
          </Stack>
        )}

        <ListPager
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
          hrefFor={(nextPage) => hrefFor(nextPage, unreadOnly)}
        />
      </Stack>
    </Page>
  );
}
