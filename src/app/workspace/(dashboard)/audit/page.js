import AuditLogView from '@/components/workspace/AuditLogView';
import { requirePermissionPage } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Audit log',
};

export default async function AuditLogPage() {
  const viewer = await requirePermissionPage('audit.view');

  return <AuditLogView timezone={viewer.workspace.timezone || 'UTC'} />;
}
