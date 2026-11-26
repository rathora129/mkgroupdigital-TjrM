import MeetingsView from '@/components/workspace/meetings/MeetingsView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { listLeads } from '@/lib/leads/service';
import { listMeetings, meetingAccessFor } from '@/lib/meetings/service';
import { meetingQuerySchema } from '@/lib/sales/validation';
import { getCalendarReadiness } from '@/lib/workforce/calendar';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Meetings',
};

const DEFAULT_QUERY = {
  page: 1,
  pageSize: 20,
  upcoming: false,
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
    return await meetingQuerySchema.validate(
      { ...cleanParams(params), upcoming: params.upcoming === 'true' },
      { abortEarly: false, stripUnknown: true },
    );
  } catch {
    return { ...DEFAULT_QUERY };
  }
}

export default async function MeetingsPage({ searchParams }) {
  const viewer = await requirePermissionPage('meetings.view');
  const params = (await searchParams) || {};
  const query = await parseQuery(params);
  const workspaceId = viewer.membership.workspaceId;

  const [meetings, leads] = await Promise.all([
    listMeetings(workspaceId, query, meetingAccessFor(viewer)),
    listLeads(
      workspaceId,
      viewer.user.id,
      {
        page: 1,
        pageSize: 100,
        sort: 'company',
        direction: 'asc',
        archived: 'active',
      },
      meetingAccessFor(viewer),
    ),
  ]);

  return (
    <MeetingsView
      meetings={meetings}
      leadOptions={leads.items.map((lead) => ({
        id: lead.id,
        companyName: lead.companyName,
      }))}
      calendar={getCalendarReadiness()}
      query={query}
      canSchedule={hasPermission(viewer.membership.role, 'meetings.schedule')}
      canManage={hasPermission(viewer.membership.role, 'meetings.manage')}
      timezone={viewer.workspace.timezone || 'UTC'}
    />
  );
}
