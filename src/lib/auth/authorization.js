import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AccessError } from '@/lib/api-error';
import { hasPermission } from '@/lib/auth/permissions';
import { findMembershipForUser } from '@/lib/workspace/service';

export async function getSessionSafely() {
  try {
    return await auth();
  } catch {
    // Missing secret or an unreadable cookie must behave like "signed out",
    // never like an authorised request.
    return null;
  }
}

// Workspace identity is always resolved from the session plus the database.
// Nothing supplied by the browser (workspace id, role, member id) is trusted.
export async function getViewer() {
  const session = await getSessionSafely();
  const user = session?.user;

  if (!user?.id) {
    return { status: 'unauthenticated', user: null };
  }

  try {
    const access = await findMembershipForUser(user.id);
    if (!access) {
      return { status: 'no_membership', user };
    }
    return {
      status: 'ok',
      user,
      membership: access.membership,
      workspace: access.workspace,
    };
  } catch {
    return { status: 'unavailable', user };
  }
}

export async function requireMember() {
  const viewer = await getViewer();

  if (viewer.status === 'unauthenticated') {
    throw new AccessError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  if (viewer.status === 'no_membership') {
    throw new AccessError(
      403,
      'FORBIDDEN',
      'This account does not have access to the workspace.',
    );
  }
  if (viewer.status === 'unavailable') {
    throw new AccessError(
      503,
      'UNAVAILABLE',
      'Workspace services are temporarily unavailable.',
    );
  }

  return viewer;
}

// Server components must guard themselves: a layout redirect does not stop a
// page from rendering in parallel, so pages call this before reading any data.
export async function requireMemberPage() {
  const viewer = await getViewer();
  if (viewer.status !== 'ok') {
    redirect('/workspace/login');
  }
  return viewer;
}

// The role always comes from the membership row read for the session user.
// A permission check therefore cannot be satisfied by anything the browser
// sends, and every role check in the application funnels through this helper.
export async function requirePermission(permission) {
  const viewer = await requireMember();

  if (!hasPermission(viewer.membership.role, permission)) {
    throw new AccessError(
      403,
      'FORBIDDEN',
      'Your role does not allow this action.',
    );
  }

  return viewer;
}

export async function requirePermissionPage(permission, redirectTo = '/workspace') {
  const viewer = await requireMemberPage();
  if (!hasPermission(viewer.membership.role, permission)) {
    redirect(redirectTo);
  }
  return viewer;
}
