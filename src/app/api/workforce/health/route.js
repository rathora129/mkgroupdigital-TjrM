import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { isEmailConfigured } from '@/lib/email/send';
import { getAuthReadiness } from '@/lib/auth/readiness';
import { configuredProviderKeys } from '@/lib/ai/registry';
import { checkAiWorker } from '@/lib/ai/worker-health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function checkDatabase() {
  if (!isDatabaseConfigured()) return 'not_configured';

  let timer;
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Database check timed out')),
          2500,
        );
      }),
    ]);
    return 'reachable';
  } catch {
    return 'unreachable';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  const [database, worker] = await Promise.all([
    checkDatabase(),
    checkAiWorker(),
  ]);
  const readiness = getAuthReadiness();
  const aiProviders = configuredProviderKeys();

  return NextResponse.json(
    {
      status: database === 'unreachable' ? 'degraded' : 'ok',
      service: 'mk-ai-workforce',
      shell: 'available',
      phase: 5,
      phaseLabel: '2I · Sales & AI Workforce',
      checks: {
        database,
        authentication: readiness.ready ? 'configured' : 'incomplete',
        emailDelivery: isEmailConfigured() ? 'configured' : 'not_configured',
        aiProviders: aiProviders.length ? 'configured' : 'not_configured',
        aiWorker: worker.status,
      },
      aiExecution: aiProviders.length ? 'available' : 'not_configured',
      dataSources: 'workspace_database',
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
