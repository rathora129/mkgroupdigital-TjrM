import SalesView from '@/components/workspace/sales/SalesView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { leadAccessFor } from '@/lib/leads/service';
import { leadQuerySchema } from '@/lib/leads/validation';
import { listMeetings, meetingAccessFor } from '@/lib/meetings/service';
import { getSalesCallerWorkspace } from '@/lib/sales/service';
import { getCalendarReadiness } from '@/lib/workforce/calendar';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sales & calls',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 20,
  sort: 'followUp',
  direction: 'asc',
  archived: 'active',
};

function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== '' && value !== undefined && value !== null,
    ),
  );
}

async function parseQuery(params) {
  try {
    return await leadQuerySchema.validate(cleanParams(params), {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function SalesPage({ searchParams }) {
  const viewer = await requirePermissionPage('leads.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;
  const access = leadAccessFor(viewer);

  const [workspace, meetings, members] = await Promise.all([
    getSalesCallerWorkspace({
      workspaceId,
      userId: viewer.user.id,
      access,
      leadQuery: query,
    }),
    listMeetings(
      workspaceId,
      { page: 1, pageSize: 6, status: undefined, upcoming: true, search: undefined },
      meetingAccessFor(viewer),
    ),
    listMembers(workspaceId),
  ]);

  return (
    <SalesView
      data={workspace}
      meetings={meetings.items}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
      }))}
      calendar={getCalendarReadiness()}
      query={query}
      canLogCalls={hasPermission(viewer.membership.role, 'calls.log')}
      canCreateTask={hasPermission(viewer.membership.role, 'tasks.create')}
      canScheduleMeeting={hasPermission(
        viewer.membership.role,
        'meetings.schedule',
      )}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
