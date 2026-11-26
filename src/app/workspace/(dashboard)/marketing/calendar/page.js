import ContentCalendarView from '@/components/workspace/marketing/content/ContentCalendarView';
import { requirePermissionPage } from '@/lib/auth/authorization';
import { listContent } from '@/lib/marketing/content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Marketing content calendar',
};

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeMonth(value) {
  if (typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return value;
  }
  return currentMonth();
}

export default async function ContentCalendarPage({ searchParams }) {
  const viewer = await requirePermissionPage('marketing.view');
  const params = (await searchParams) || {};
  const month = normalizeMonth(params.month);
  const [year, monthNumber] = month.split('-').map(Number);

  const from = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59));

  const content = await listContent(viewer.membership.workspaceId, viewer.user.id, {
    page: 1,
    pageSize: 50,
    view: 'month',
    from,
    to,
  });

  return <ContentCalendarView content={content} month={month} />;
}
