import { NextResponse } from 'next/server';

const LOGIN_PATH = '/workspace/login';

const SESSION_COOKIES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
];

// Redirects before rendering so unauthenticated requests get a real 307 instead
// of a streamed redirect. This only decides *where* to send the browser: every
// workspace page and API still verifies the session and membership server-side.
export function proxy(request) {
  if (request.nextUrl.pathname === LOGIN_PATH) {
    return NextResponse.next();
  }

  const hasSessionCookie = SESSION_COOKIES.some((name) =>
    request.cookies.has(name),
  );

  if (hasSessionCookie) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL(LOGIN_PATH, request.nextUrl));
}

export const config = {
  matcher: ['/workspace/:path*'],
};
