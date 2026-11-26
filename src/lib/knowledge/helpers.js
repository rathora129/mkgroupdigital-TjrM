import { and, eq } from 'drizzle-orm';
import { getDb, getDbDriver } from '@/db/client';
import { agents, clients, projects } from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { isUniqueViolation } from '@/lib/business/references';

export { isUniqueViolation };

export async function runAtomic(build) {
  const db = getDb();
  if (getDbDriver() === 'node-postgres') return db.transaction(build);
  return build(db);
}

export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

export function staleError(label = 'knowledge entry') {
  return new ApiError(
    409,
    'STALE_RECORD',
    `This ${label} changed while you were editing it. Reload and try again.`,
  );
}

export async function assertClientScope(workspaceId, clientId) {
  if (!clientId) return null;
  const rows = await getDb()
    .select({ id: clients.id, companyName: clients.companyName })
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(
      422,
      'CLIENT_NOT_FOUND',
      'Choose a client from this workspace.',
      { clientId: 'Choose a client from this workspace.' },
    );
  }
  return rows[0];
}

export async function assertProjectScope(workspaceId, projectId) {
  if (!projectId) return null;
  const rows = await getDb()
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(
      422,
      'PROJECT_NOT_FOUND',
      'Choose a project from this workspace.',
      { projectId: 'Choose a project from this workspace.' },
    );
  }
  return rows[0];
}

export async function assertAgentScope(workspaceId, agentId) {
  if (!agentId) return null;
  const rows = await getDb()
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
    .limit(1);
  if (!rows[0]) {
    throw new ApiError(
      422,
      'AGENT_NOT_FOUND',
      'Choose an agent from this workspace.',
      { agentId: 'Choose an agent from this workspace.' },
    );
  }
  return rows[0];
}
