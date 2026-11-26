'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckSquare, CircleAlert, Search } from 'lucide-react';
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
  Notice,
  Page,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDate } from '@/lib/ai/format';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import {
  durationLabel,
  metaFor,
  PRIORITY_META,
  TASK_STATUS_META,
} from './meta';

const STATUS_ORDER = [
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'completed',
  'cancelled',
];

const LIST_KEYS = [
  'search',
  'status',
  'priority',
  'owner',
  'due',
  'sort',
  'direction',
  'projectId',
  'page',
];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    if (key === 'sort' && value === 'created') continue;
    if (key === 'direction' && value === 'desc') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/workspace/tasks?${text}` : '/workspace/tasks';
}

export default function TaskListView({
  tasks,
  overview,
  members,
  projects,
  query,
  timezone,
}) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = tasks;

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const overrides = {};
    for (const key of LIST_KEYS) {
      if (key === 'page') continue;
      const value = String(data.get(key) ?? '').trim();
      overrides[key] = value || undefined;
    }
    router.push(listHref(overrides));
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Delivery operations</Eyebrow>
        <Title>Task board</Title>
        <Lead>
          Every task across active projects with owner, due date and effort.
          Filter by status or owner to plan the week.
        </Lead>
      </Header>

      <Notice $tone="info">
        <CheckSquare size={15} />
        <span>
          Task status follows a controlled flow. Open a task from its project to
          change status or add comments.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Overdue</StatLabel>
          <StatValue>{overview.overdueTasks}</StatValue>
          <StatNote>Open tasks past their due date</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Due today</StatLabel>
          <StatValue>{overview.dueToday}</StatValue>
          <StatNote>Open tasks with today&apos;s due date</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Active projects</StatLabel>
          <StatValue>{overview.active}</StatValue>
          <StatNote>{overview.onHold} on hold</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Upcoming milestones</StatLabel>
          <StatValue>{overview.upcomingMilestones}</StatValue>
          <StatNote>Due in the next 14 days</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Tasks</CardTitle>
            <CardText>
              {total} {total === 1 ? 'task' : 'tasks'} match the current
              filters. Showing page {page} of {pages}.
            </CardText>
          </div>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip href={listHref(query, { status: undefined })} $active={!query.status}>
            All statuses
          </FilterChip>
          {STATUS_ORDER.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={query.status === status}
            >
              {TASK_STATUS_META[status].label}
            </FilterChip>
          ))}
        </div>

        <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
          <input type="hidden" name="status" value={query.status || ''} />
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Task or project"
            />
          </FilterField>
          <FilterField>
            <span>Project</span>
            <select name="projectId" defaultValue={query.projectId || ''}>
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.reference} · {project.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Owner</span>
            <select name="owner" defaultValue={query.owner || ''}>
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Priority</span>
            <select name="priority" defaultValue={query.priority || ''}>
              <option value="">Any</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Due</span>
            <select name="due" defaultValue={query.due || ''}>
              <option value="">Any</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="week">Due this week</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Sort by</span>
            <select name="sort" defaultValue={query.sort || 'created'}>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="due">Due date</option>
              <option value="priority">Priority</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Direction</span>
            <select name="direction" defaultValue={query.direction || 'desc'}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
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
              onClick={() => router.push('/workspace/tasks')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <CheckSquare size={17} aria-hidden="true" />
            <div>
              <h3>No tasks match these filters</h3>
              <p>Add tasks from a project detail page to track delivery work.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th>Effort (est / actual)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((task) => {
                  const status = metaFor(TASK_STATUS_META, task.status);
                  const priority = metaFor(PRIORITY_META, task.priority);
                  return (
                    <tr key={task.id}>
                      <td>
                        <Link
                          href={`/workspace/projects/${task.projectId}?tab=tasks&task=${task.id}`}
                        >
                          {task.title}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/workspace/projects/${task.projectId}`}>
                          {task.projectName}
                        </Link>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {task.projectReference}
                          {task.clientName ? ` · ${task.clientName}` : ''}
                        </div>
                      </td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        <Badge $tone={priority.tone}>{priority.label}</Badge>
                      </td>
                      <td>{task.ownerName || 'Unassigned'}</td>
                      <td>
                        {formatDate(task.dueDate, timezone)}
                        {task.isOverdue ? (
                          <span style={{ color: '#B91C1C' }}> · overdue</span>
                        ) : null}
                      </td>
                      <td>
                        {durationLabel(task.estimatedMinutes)} /{' '}
                        {durationLabel(task.actualMinutes)}
                      </td>
                    </tr>
                  );
                })}
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
        <CircleAlert size={12} aria-hidden="true" /> Effort is a planning
        estimate. It is not billable time and does not post to the finance
        module.
      </Hint>
    </Page>
  );
}
