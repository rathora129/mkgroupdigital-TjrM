import { errorResponse, jsonOk } from '@/lib/api';
import { requirePermission } from '@/lib/auth/authorization';
import { getCalendarReadiness } from '@/lib/workforce/calendar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await requirePermission('meetings.view');
    return jsonOk(getCalendarReadiness());
  } catch (error) {
    return errorResponse(error);
  }
}
