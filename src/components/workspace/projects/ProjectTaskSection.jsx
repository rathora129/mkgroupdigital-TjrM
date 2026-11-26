'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, Loader2, MessageSquare, Pencil, Plus } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import { formatDate, formatDateTime } from '@/lib/ai/format';
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_TRANSITIONS,
} from '@/lib/projects/transitions';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  Field,
  Label,
  Notice,
  Select,
  Stack,
  Table,
  TableWrap,
  Textarea,
} from '@/components/workspace/ai/primitives';
import { MetaGrid, Subhead, Timeline, TimelineItem } from '@/components/workspace/phase2c/ui';
import {
  durationLabel,
  metaFor,
  PRIORITY_META,
  TASK_STATUS_META,
} from './meta';
import TaskForm from './TaskForm';

export default function ProjectTaskSection({
  projectId,
  projectStatus,
  tasks,
  members,
  canEdit,
  timezone,
  onChanged,
  initialTaskId = null,
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(initialTaskId);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [statusDraft, setStatusDraft] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const closed = projectStatus === 'completed' || projectStatus === 'cancelled';

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    apiRequest(`/api/workforce/tasks/${selectedId}`)
      .then((result) => {
        if (!active) return;
        setDetail(result);
        setStatusDraft(result.task.status);
      })
      .catch((error) => {
        if (active) setFailure(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  function afterChange(message) {
    setNotice(message);
    setFailure(null);
    setEditing(false);
    if (selectedId) {
      apiRequest(`/api/workforce/tasks/${selectedId}`)
        .then((result) => {
          setDetail(result);
          setStatusDraft(result.task.status);
        })
        .catch(() => {});
    }
    router.refresh();
    onChanged?.();
  }

  async function saveStatus() {
    if (!detail || statusDraft === detail.task.status) return;
    setSavingStatus(true);
    setFailure(null);
    try {
      const result = await apiRequest(`/api/workforce/tasks/${detail.task.id}`, {
        method: 'PATCH',
        body: {
          title: detail.task.title,
          status: statusDraft,
          expectedUpdatedAt: new Date(detail.task.updatedAt).toISOString(),
        },
      });
      setDetail(result);
      setNotice('Task status updated.');
      router.refresh();
      onChanged?.();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setSavingStatus(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!detail || !comment.trim()) return;
    setSavingComment(true);
    setFailure(null);
    try {
      const result = await apiRequest(
        `/api/workforce/tasks/${detail.task.id}/comments`,
        { method: 'POST', body: { body: comment.trim() } },
      );
      setDetail(result);
      setComment('');
      setNotice('Comment added.');
      router.refresh();
      onChanged?.();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setSavingComment(false);
    }
  }

  const statusOptions = detail
    ? [detail.task.status, ...(TASK_STATUS_TRANSITIONS[detail.task.status] || [])]
    : [];

  return (
    <Card>
      <CardHead>
        <div>
          <CardTitle>Tasks</CardTitle>
          <CardText>
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} in this
            project. Status changes follow the controlled flow.
          </CardText>
        </div>
        {canEdit && !closed ? (
          <Actions>
            <Button
              type="button"
              $variant="primary"
              onClick={() => {
                setShowCreate((current) => !current);
                setEditing(false);
              }}
            >
              <Plus size={14} />
              {showCreate ? 'Close form' : 'Add task'}
            </Button>
          </Actions>
        ) : null}
      </CardHead>

      {failure ? <Notice $tone="danger">{failure}</Notice> : null}
      {notice ? <Notice $tone="success">{notice}</Notice> : null}
      {closed ? (
        <Notice $tone="info">
          This project is {projectStatus}. Its tasks are read-only.
        </Notice>
      ) : null}

      {showCreate && canEdit && !closed ? (
        <Card $flat>
          <Subhead>New task</Subhead>
          <TaskForm
            projectId={projectId}
            tasks={tasks}
            members={members}
            onDone={() => {
              setShowCreate(false);
              afterChange('Task added.');
            }}
            onCancel={() => setShowCreate(false)}
          />
        </Card>
      ) : null}

      {tasks.length === 0 ? (
        <CardText>No tasks yet. Break the accepted scope into tracked work.</CardText>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Effort (est / actual)</th>
                <th>Comments</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const status = metaFor(TASK_STATUS_META, task.status);
                const priority = metaFor(PRIORITY_META, task.priority);
                return (
                  <tr key={task.id}>
                    <td>{task.title}</td>
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
                    <td>{task.commentCount}</td>
                    <td>
                      <Button
                        type="button"
                        $variant="ghost"
                        onClick={() => {
                          setDetail(null);
                          setLoading(true);
                          setSelectedId((current) =>
                            current === task.id ? null : task.id,
                          );
                        }}
                      >
                        {selectedId === task.id ? 'Hide' : 'Open'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {selectedId ? (
        <Card $flat>
          <CardHead>
            <div>
              <CardTitle>
                {detail?.task.title || 'Task detail'}
                {detail ? (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: '0.74rem',
                      color: '#64748B',
                      fontWeight: 500,
                    }}
                  >
                    {detail.task.projectReference}
                  </span>
                ) : null}
              </CardTitle>
              <CardText>Comments are internal to the workspace.</CardText>
            </div>
            <Actions>
              {canEdit && detail && !closed ? (
                <Button
                  type="button"
                  onClick={() => setEditing((current) => !current)}
                >
                  <Pencil size={14} />
                  {editing ? 'Close editor' : 'Edit task'}
                </Button>
              ) : null}
              <Button type="button" $variant="ghost" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </Actions>
          </CardHead>

          {loading && !detail ? (
            <CardText>
              <Loader2 size={14} className="spin" /> Loading task…
            </CardText>
          ) : null}

          {detail ? (
            <Stack $gap={14}>
              {editing && canEdit ? (
                <TaskForm
                  projectId={projectId}
                  task={detail.task}
                  tasks={tasks}
                  members={members}
                  onDone={() => afterChange('Task updated.')}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <>
                  <MetaGrid>
                    <div>
                      <dt>Status</dt>
                      <dd>
                        {TASK_STATUS_LABELS[detail.task.status] || detail.task.status}
                      </dd>
                    </div>
                    <div>
                      <dt>Priority</dt>
                      <dd>{detail.task.priority}</dd>
                    </div>
                    <div>
                      <dt>Owner</dt>
                      <dd>{detail.task.ownerName || 'Unassigned'}</dd>
                    </div>
                    <div>
                      <dt>Start</dt>
                      <dd>{formatDate(detail.task.startDate, timezone)}</dd>
                    </div>
                    <div>
                      <dt>Due</dt>
                      <dd>{formatDate(detail.task.dueDate, timezone)}</dd>
                    </div>
                    <div>
                      <dt>Estimated</dt>
                      <dd>{durationLabel(detail.task.estimatedMinutes)}</dd>
                    </div>
                    <div>
                      <dt>Actual</dt>
                      <dd>{durationLabel(detail.task.actualMinutes)}</dd>
                    </div>
                    <div>
                      <dt>Completed</dt>
                      <dd>{formatDateTime(detail.task.completedAt, timezone)}</dd>
                    </div>
                  </MetaGrid>

                  {detail.task.description ? (
                    <CardText>{detail.task.description}</CardText>
                  ) : null}

                  <MetaGrid>
                    <div>
                      <dt>Collaborators</dt>
                      <dd>
                        {detail.collaborators.length
                          ? detail.collaborators
                              .map((entry) => entry.name || entry.email)
                              .join(', ')
                          : 'None'}
                      </dd>
                    </div>
                    <div>
                      <dt>Depends on</dt>
                      <dd>
                        {detail.dependencies.length
                          ? detail.dependencies
                              .map((entry) => `${entry.title} (${entry.status})`)
                              .join(', ')
                          : 'None'}
                      </dd>
                    </div>
                  </MetaGrid>

                  {canEdit && !closed ? (
                    <Field>
                      <Label htmlFor="task-status-quick">Change status</Label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Select
                          id="task-status-quick"
                          value={statusDraft}
                          onChange={(event) => setStatusDraft(event.target.value)}
                          disabled={savingStatus}
                          style={{ maxWidth: 240 }}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {TASK_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          onClick={saveStatus}
                          disabled={
                            savingStatus || statusDraft === detail.task.status
                          }
                        >
                          {savingStatus ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <CheckSquare size={14} />
                          )}
                          Update status
                        </Button>
                      </div>
                    </Field>
                  ) : null}
                </>
              )}

              <Subhead>Activity</Subhead>
              {detail.comments.length === 0 ? (
                <CardText>No comments yet.</CardText>
              ) : (
                <Timeline>
                  {detail.comments.map((entry) => (
                    <TimelineItem key={entry.id}>
                      <strong>{entry.authorName || 'Workspace member'}</strong>
                      <p>{entry.body}</p>
                      <span>{formatDateTime(entry.createdAt, timezone)}</span>
                    </TimelineItem>
                  ))}
                </Timeline>
              )}

              {!closed ? (
                <form onSubmit={submitComment}>
                  <Field>
                    <Label htmlFor="task-comment">Add a comment</Label>
                    <Textarea
                      id="task-comment"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      maxLength={4_000}
                      style={{ minHeight: 70 }}
                      placeholder="Internal note for the delivery team."
                      disabled={savingComment}
                    />
                  </Field>
                  <Actions>
                    <Button
                      type="submit"
                      disabled={savingComment || !comment.trim()}
                    >
                      {savingComment ? (
                        <Loader2 size={14} className="spin" />
                      ) : (
                        <MessageSquare size={14} />
                      )}
                      Add comment
                    </Button>
                  </Actions>
                </form>
              ) : null}
            </Stack>
          ) : null}
        </Card>
      ) : null}
    </Card>
  );
}
