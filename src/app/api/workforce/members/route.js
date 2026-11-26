import { errorResponse, jsonOk } from '@/lib/api';
import { requireMember } from '@/lib/auth/authorization';
import { listMembers } from '@/lib/workspace/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const viewer = await requireMember();
    const members = await listMembers(viewer.membership.workspaceId);

    return jsonOk({
      members: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.name || null,
        email: member.email,
        role: member.role,
        createdAt: member.createdAt,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
