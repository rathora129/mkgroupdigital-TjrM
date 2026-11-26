'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormik } from 'formik';
import * as yup from 'yup';
import {
  Archive,
  BadgeCheck,
  Bot,
  CircleAlert,
  Loader2,
  Pencil,
  Play,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import styled from 'styled-components';
import { workspaceMedia } from '@/styles/workspaceTheme';
import { agentTypeLabel } from '@/lib/ai/agent-types';
import { apiRequest } from '@/lib/ai/client';
import {
  formatCents,
  formatDateTime,
  formatTokens,
  statusMeta,
} from '@/lib/ai/format';
import AgentForm from './AgentForm';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  Divider,
  EmptyState,
  ErrorText,
  Field,
  Grid,
  Header,
  Hint,
  Input,
  Label,
  Lead,
  LinkButton,
  Notice,
  Page,
  Row,
  Stack,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
  Eyebrow,
} from './primitives';

const AgentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
`;

const AgentCard = styled.article`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
`;

const AgentTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;

  h3 {
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  p {
    margin-top: 3px;
    font-size: 0.74rem;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const MetaList = styled.dl`
  display: flex;
  flex-direction: column;
  gap: 5px;

  div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.76rem;
  }

  dt {
    color: ${({ theme }) => theme.colors.muted};
  }

  dd {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-weight: 600;
    text-align: right;
  }
`;

const AgentActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
  padding-top: 4px;
`;

const SmallButton = styled(Button)`
  min-height: 32px;
  padding: 0 10px;
  font-size: 0.74rem;
`;

const SmallLink = styled(LinkButton)`
  min-height: 32px;
  padding: 0 10px;
  font-size: 0.74rem;
`;

const ProviderList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ProviderRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 200px) auto;
  gap: 10px;
  align-items: end;
  padding: 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};

  ${workspaceMedia.down('md')} {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`;

const ProviderName = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  strong {
    font-size: 0.85rem;
  }

  span {
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const UsageBar = styled.div`
  height: 7px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.surfaceMuted};
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    width: ${({ $percent }) => `${Math.min(100, Math.max(0, $percent))}%`};
    background: ${({ theme, $tone }) =>
      $tone === 'danger' ? theme.colors.danger : theme.colors.primary};
  }
`;

const limitsSchema = yup.object({
  monthlyTokenLimit: yup
    .number()
    .transform((value, original) => (original === '' ? null : value))
    .integer('Whole numbers only.')
    .min(0, 'Cannot be negative.')
    .nullable(),
  monthlyBudgetCents: yup
    .number()
    .transform((value, original) => (original === '' ? null : value))
    .integer('Whole numbers only.')
    .min(0, 'Cannot be negative.')
    .nullable(),
});

function LimitsForm({ usage, onSaved }) {
  const [failure, setFailure] = useState(null);
  const formik = useFormik({
    initialValues: {
      monthlyTokenLimit:
        usage.tokenLimit == null ? '' : String(usage.tokenLimit),
      monthlyBudgetCents:
        usage.budgetLimitCents == null ? '' : String(usage.budgetLimitCents),
    },
    validationSchema: limitsSchema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        await apiRequest('/api/workforce/ai/settings', {
          method: 'PATCH',
          body: {
            monthlyTokenLimit:
              values.monthlyTokenLimit === ''
                ? null
                : Number(values.monthlyTokenLimit),
            monthlyBudgetCents:
              values.monthlyBudgetCents === ''
                ? null
                : Number(values.monthlyBudgetCents),
          },
        });
        onSaved?.();
      } catch (error) {
        if (error.code === 'VALIDATION_FAILED' && error.details) {
          helpers.setErrors(error.details);
        }
        setFailure(error.message);
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={12}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}
        <Grid $cols={2}>
          <Field>
            <Label htmlFor="workspace-token-limit">Workspace token limit</Label>
            <Input
              id="workspace-token-limit"
              name="monthlyTokenLimit"
              type="number"
              min="0"
              value={formik.values.monthlyTokenLimit}
              onChange={formik.handleChange}
              placeholder="No limit"
              disabled={formik.isSubmitting}
            />
            <Hint>
              {formatTokens(usage.tokens)} tokens used this month.
            </Hint>
            {formik.errors.monthlyTokenLimit ? (
              <ErrorText>{formik.errors.monthlyTokenLimit}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="workspace-budget-limit">
              Workspace budget (cents)
            </Label>
            <Input
              id="workspace-budget-limit"
              name="monthlyBudgetCents"
              type="number"
              min="0"
              value={formik.values.monthlyBudgetCents}
              onChange={formik.handleChange}
              placeholder="No limit"
              disabled={formik.isSubmitting}
            />
            <Hint>
              {formatCents(usage.costCents)} estimated this month.
            </Hint>
            {formik.errors.monthlyBudgetCents ? (
              <ErrorText>{formik.errors.monthlyBudgetCents}</ErrorText>
            ) : null}
          </Field>
        </Grid>
        <Actions>
          <Button type="submit" disabled={formik.isSubmitting || !formik.dirty}>
            {formik.isSubmitting ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Save size={15} />
            )}
            Save limits
          </Button>
        </Actions>
      </Stack>
    </form>
  );
}

function ProviderRowEditor({ provider, onSaved }) {
  const [enabled, setEnabled] = useState(provider.workspaceEnabled);
  const [model, setModel] = useState(
    provider.workspaceDefaultModel || provider.defaultModel || '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/workforce/ai/providers/${provider.key}`, {
        method: 'PATCH',
        body: {
          enabled,
          defaultModel: model.trim() || null,
        },
      });
      onSaved?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProviderRow>
      <ProviderName>
        <Row>
          <strong>{provider.label}</strong>
          <Badge $tone={provider.configured ? 'success' : 'warning'}>
            {provider.configured ? 'Server key present' : 'No server key'}
          </Badge>
          <Badge $tone={enabled ? 'info' : 'muted'}>
            {enabled ? 'Workspace enabled' : 'Workspace disabled'}
          </Badge>
        </Row>
        <span>
          {provider.configured
            ? 'Provider credentials are read from the server environment.'
            : 'An operator must add the provider credential before runs can execute.'}
        </span>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </ProviderName>

      <Field>
        <Label htmlFor={`default-model-${provider.key}`}>Default model</Label>
        <Input
          id={`default-model-${provider.key}`}
          list={`models-${provider.key}`}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          disabled={busy}
        />
        <datalist id={`models-${provider.key}`}>
          {provider.models.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </datalist>
      </Field>

      <Row>
        <SmallButton
          type="button"
          onClick={() => setEnabled((current) => !current)}
          disabled={busy}
        >
          {enabled ? 'Disable' : 'Enable'}
        </SmallButton>
        <SmallButton type="button" onClick={save} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          Save
        </SmallButton>
      </Row>
    </ProviderRow>
  );
}

export default function AiWorkforceView({
  agents,
  overview,
  canManage,
  canRun,
  timezone,
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);

  const { usage, providers, recentRuns, runtimeConfigured } = overview;
  const configured = providers.filter((provider) => provider.configured);

  function refresh(message) {
    setFailure(null);
    if (message) setNotice(message);
    router.refresh();
  }

  async function archiveAgent(agent) {
    setBusyId(agent.id);
    setFailure(null);
    try {
      await apiRequest(`/api/workforce/ai/agents/${agent.id}`, {
        method: 'DELETE',
      });
      setArchiveTarget(null);
      refresh(`"${agent.name}" was archived. Its run history is unchanged.`);
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusyId(null);
    }
  }

  const usagePercent =
    usage.tokenLimit && usage.tokenLimit > 0
      ? (usage.tokens / usage.tokenLimit) * 100
      : 0;

  return (
    <Page>
      <Header>
        <Eyebrow>AI Workforce</Eyebrow>
        <Title>Agents, execution and human approval</Title>
        <Lead>
          Define what each agent is allowed to do, how much it may spend, and
          which runs need a human decision. Provider calls run in a separate
          worker process, never inside a web request.
        </Lead>
      </Header>

      {notice ? (
        <Notice $tone="success">
          <BadgeCheck size={15} />
          {notice}
        </Notice>
      ) : null}
      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          {failure}
        </Notice>
      ) : null}

      {runtimeConfigured ? (
        <Notice $tone="success">
          <ShieldCheck size={15} />
          AI execution is available through{' '}
          {configured.map((provider) => provider.label).join(', ')}. Runs are
          queued for the worker; provider spend appears below.
        </Notice>
      ) : (
        <Notice $tone="warning">
          <CircleAlert size={15} />
          <span>
            <strong>AI execution is not configured.</strong> No provider
            credential exists on this server, so agents can be prepared and
            approvals exercised, but runs cannot execute. An operator must add
            a provider API key to the server environment — never to the
            database or this screen.
          </span>
        </Notice>
      )}

      <StatGrid>
        <StatCard>
          <StatLabel>Agents</StatLabel>
          <StatValue>
            {overview.agents.enabled} / {overview.agents.total}
          </StatValue>
          <StatNote>Enabled / total</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Runs this month</StatLabel>
          <StatValue>{usage.runs}</StatValue>
          <StatNote>{usage.open} open now</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Tokens this month</StatLabel>
          <StatValue>{formatTokens(usage.tokens)}</StatValue>
          <StatNote>
            {usage.tokenLimit ? `Limit ${formatTokens(usage.tokenLimit)}` : 'No token limit'}
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Estimated cost</StatLabel>
          <StatValue>{formatCents(usage.costCents)}</StatValue>
          <StatNote>
            {usage.budgetLimitCents
              ? `Limit ${formatCents(usage.budgetLimitCents)}`
              : 'No budget limit'}
          </StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Agents</CardTitle>
            <CardText>
              {overview.agents.approvalRequired} of {overview.agents.total}{' '}
              agents require human approval before execution.
            </CardText>
          </div>
          <Actions>
            {overview.pendingApprovals > 0 ? (
              <SmallLink href="/workspace/approvals">
                <BadgeCheck size={14} />
                {overview.pendingApprovals} pending approval
              </SmallLink>
            ) : null}
            {canManage ? (
              <Button
                type="button"
                $variant="primary"
                onClick={() => {
                  setEditing(null);
                  setShowCreate(true);
                }}
              >
                <Plus size={15} />
                New agent
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {showCreate || editing ? (
          <Card style={{ background: 'transparent', boxShadow: 'none' }}>
            <CardHead>
              <CardTitle>
                {editing ? `Edit ${editing.name}` : 'Create an agent'}
              </CardTitle>
            </CardHead>
            <AgentForm
              agent={editing}
              providers={providers}
              onDone={(agent) => {
                setShowCreate(false);
                setEditing(null);
                refresh(
                  agent
                    ? `"${agent.name}" was ${editing ? 'updated' : 'created'}.`
                    : null,
                );
              }}
              onCancel={() => {
                setShowCreate(false);
                setEditing(null);
              }}
            />
          </Card>
        ) : null}

        {agents.length === 0 ? (
          <EmptyState>
            <span>
              <Bot size={18} aria-hidden="true" />
            </span>
            <div>
              <h3>No agents configured</h3>
              <p>
                Create an agent to choose a role, provider, model, limits and
                whether every run needs human approval.
              </p>
            </div>
          </EmptyState>
        ) : (
          <AgentGrid>
            {agents.map((agent) => {
              const type = agentTypeLabel(agent.type);
              const provider = providers.find(
                (item) => item.key === agent.provider,
              );
              return (
                <AgentCard key={agent.id}>
                  <AgentTop>
                    <div>
                      <h3>{agent.name}</h3>
                      <p>{type}</p>
                    </div>
                    <Badge $tone={agent.enabled ? 'success' : 'muted'}>
                      {agent.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </AgentTop>

                  {agent.description ? (
                    <CardText>{agent.description}</CardText>
                  ) : null}

                  <Row>
                    {agent.approvalRequired ? (
                      <Badge $tone="warning">Approval required</Badge>
                    ) : (
                      <Badge $tone="muted">No approval gate</Badge>
                    )}
                    <Badge $tone={provider?.configured ? 'info' : 'warning'}>
                      {provider?.label || agent.provider}
                    </Badge>
                  </Row>

                  <MetaList>
                    <div>
                      <dt>Model</dt>
                      <dd>{agent.model}</dd>
                    </div>
                    <div>
                      <dt>Token limit</dt>
                      <dd>
                        {agent.monthlyTokenLimit == null
                          ? 'None'
                          : formatTokens(agent.monthlyTokenLimit)}
                      </dd>
                    </div>
                    <div>
                      <dt>Budget limit</dt>
                      <dd>
                        {agent.monthlyBudgetCents == null
                          ? 'None'
                          : formatCents(agent.monthlyBudgetCents)}
                      </dd>
                    </div>
                  </MetaList>

                  <AgentActions>
                    <SmallLink href={`/workspace/ai-workforce/agents/${agent.id}`} $primary>
                      Open
                    </SmallLink>
                    {canRun && agent.enabled ? (
                      <SmallLink
                        href={`/workspace/ai-workforce/agents/${agent.id}#run`}
                      >
                        <Play size={13} />
                        Run
                      </SmallLink>
                    ) : null}
                    {canManage ? (
                      <>
                        <SmallButton
                          type="button"
                          onClick={() => {
                            setShowCreate(false);
                            setEditing(agent);
                          }}
                        >
                          <Pencil size={13} />
                          Edit
                        </SmallButton>
                        <SmallButton
                          type="button"
                          $variant="danger"
                          onClick={() => setArchiveTarget(agent)}
                          disabled={busyId === agent.id}
                        >
                          {busyId === agent.id ? (
                            <Loader2 size={13} className="spin" />
                          ) : (
                            <Archive size={13} />
                          )}
                          Archive
                        </SmallButton>
                      </>
                    ) : null}
                  </AgentActions>

                  {archiveTarget?.id === agent.id ? (
                    <Notice $tone="danger">
                      <span>
                        Archive <strong>{agent.name}</strong>? Open runs will be
                        cancelled and the agent stops accepting new runs. Run
                        history is kept.
                      </span>
                      <Row>
                        <SmallButton
                          type="button"
                          $variant="danger"
                          onClick={() => archiveAgent(agent)}
                          disabled={busyId === agent.id}
                        >
                          Confirm archive
                        </SmallButton>
                        <SmallButton
                          type="button"
                          $variant="ghost"
                          onClick={() => setArchiveTarget(null)}
                        >
                          Cancel
                        </SmallButton>
                      </Row>
                    </Notice>
                  ) : null}
                </AgentCard>
              );
            })}
          </AgentGrid>
        )}
      </Card>

      <Grid $cols={2}>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Workspace AI limits</CardTitle>
              <CardText>
                Applied to every agent. Runs are refused once either limit is
                reached this calendar month (UTC).
              </CardText>
            </div>
          </CardHead>

          {usage.tokenLimit ? (
            <Stack $gap={6}>
              <UsageBar $percent={usagePercent} $tone={usagePercent >= 100 ? 'danger' : 'info'}>
                <span />
              </UsageBar>
              <Hint>
                {formatTokens(usage.tokens)} of {formatTokens(usage.tokenLimit)}{' '}
                tokens used.
              </Hint>
            </Stack>
          ) : null}

          {canManage ? (
            <LimitsForm usage={usage} onSaved={() => refresh('AI limits saved.')} />
          ) : (
            <MetaList>
              <div>
                <dt>Token limit</dt>
                <dd>
                  {usage.tokenLimit == null
                    ? 'None'
                    : formatTokens(usage.tokenLimit)}
                </dd>
              </div>
              <div>
                <dt>Budget limit</dt>
                <dd>
                  {usage.budgetLimitCents == null
                    ? 'None'
                    : formatCents(usage.budgetLimitCents)}
                </dd>
              </div>
            </MetaList>
          )}
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>Providers</CardTitle>
              <CardText>
                Credentials stay in the server environment. These switches only
                control whether this workspace may use a provider.
              </CardText>
            </div>
            <Settings2 size={16} aria-hidden="true" />
          </CardHead>

          {canManage ? (
            <ProviderList>
              {providers.map((provider) => (
                <ProviderRowEditor
                  key={provider.key}
                  provider={provider}
                  onSaved={() => refresh('Provider settings saved.')}
                />
              ))}
            </ProviderList>
          ) : (
            <MetaList>
              {providers.map((provider) => (
                <div key={provider.key}>
                  <dt>{provider.label}</dt>
                  <dd>
                    {provider.configured ? 'Key present' : 'No server key'}
                  </dd>
                </div>
              ))}
            </MetaList>
          )}
        </Card>
      </Grid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Recent runs</CardTitle>
            <CardText>The five most recent runs in this workspace.</CardText>
          </div>
          <SmallLink href="/workspace/ai-workforce/runs">
            All runs
          </SmallLink>
        </CardHead>

        {recentRuns.length === 0 ? (
          <EmptyState>
            <Sparkles size={17} aria-hidden="true" />
            <div>
              <h3>No runs yet</h3>
              <p>
                Open an enabled agent and submit a task. Runs appear here with
                status, token usage and estimated cost.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Requested</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => {
                  const meta = statusMeta(run.status);
                  return (
                    <tr key={run.id}>
                      <td>
                        <Link
                          href={`/workspace/ai-workforce/runs/${run.id}`}
                        >
                          {run.agentName}
                        </Link>
                      </td>
                      <td>
                        <Badge $tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td>
                        {formatTokens(
                          run.promptTokens + run.completionTokens,
                        )}
                      </td>
                      <td>{formatCents(run.costEstimateCents)}</td>
                      <td>{formatDateTime(run.createdAt, timezone)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {usage.byAgent.length ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Usage by agent</CardTitle>
              <CardText>This calendar month, from recorded runs.</CardText>
            </div>
          </CardHead>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Runs</th>
                  <th>Tokens</th>
                  <th>Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.byAgent.map((row) => (
                  <tr key={row.agentId}>
                    <td>{row.name}</td>
                    <td>{row.runs}</td>
                    <td>{formatTokens(row.tokens)}</td>
                    <td>{formatCents(row.costCents)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      ) : null}

      <Divider />
      <Hint>
        Agents never send money, make purchases, submit filings, sign documents,
        change infrastructure or delete records. Sensitive work requires a human
        decision in the approval queue.
      </Hint>
    </Page>
  );
}
