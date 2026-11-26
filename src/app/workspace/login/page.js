import { redirect } from 'next/navigation';
import LoginView from '@/components/workspace/LoginView';
import WorkspaceSurface from '@/components/workspace/WorkspaceSurface';
import { getViewer } from '@/lib/auth/authorization';
import { getAuthReadiness } from '@/lib/auth/readiness';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sign in',
};

export default async function LoginPage({ searchParams }) {
  const params = (await searchParams) || {};
  const viewer = await getViewer();

  if (viewer.status === 'ok') {
    redirect('/workspace');
  }

  const email =
    typeof params.email === 'string' ? params.email.slice(0, 254) : '';
  const errorCode =
    typeof params.error === 'string' ? params.error.slice(0, 64) : null;

  return (
    <WorkspaceSurface centered>
      <LoginView
        initialEmail={email}
        errorCode={errorCode}
        readiness={getAuthReadiness()}
        signedInEmail={
          viewer.status === 'no_membership' ? viewer.user?.email || null : null
        }
      />
    </WorkspaceSurface>
  );
}
