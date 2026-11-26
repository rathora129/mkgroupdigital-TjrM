import { ApiError } from '@/lib/api-error';

// Phase 2I — Google Calendar / Meet contract.
//
// The master requirement is OAuth-only, with honest status reporting. This
// build never fabricates a calendar event, a Meet link or a sync result:
//   - credentials are read from named environment variables, never stored;
//   - credentials alone are not treated as a connection, because a workspace
//     user must complete Google OAuth consent first;
//   - no event is created until a real authorized client exists.
//
// There is deliberately no API-key or service-account path here.

const REQUIRED_ENV = [
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'GOOGLE_CALENDAR_REDIRECT_URI',
];

const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

export function getCalendarReadiness() {
  const configured = REQUIRED_ENV.every((key) => Boolean(process.env[key]));

  return {
    provider: 'google_calendar',
    configured,
    // Credentials are only a prerequisite. Nothing in this build stores an
    // OAuth refresh token, so a user connection cannot honestly be claimed.
    connected: false,
    syncCapable: false,
    reason: configured ? 'NOT_CONNECTED' : 'NOT_CONFIGURED',
    message: configured
      ? 'Google Calendar credentials are present, but no workspace user has completed OAuth consent in this build. Meetings are saved locally and are not sent to Google Calendar.'
      : 'Google Calendar is not configured. Meetings are saved locally only; no Google Meet link or calendar invite is created.',
    requiredEnv: REQUIRED_ENV,
    scopes: REQUIRED_SCOPES,
  };
}

export function assertCalendarConnected() {
  const readiness = getCalendarReadiness();
  if (!readiness.connected) {
    throw new ApiError(
      409,
      'CALENDAR_NOT_CONNECTED',
      'Google Calendar is not connected. Meetings are stored locally only.',
      { reason: readiness.reason },
    );
  }
  return readiness;
}

// Kept as an explicit contract so a real OAuth client can be wired in later
// without silently changing behaviour: until then every call fails closed.
export async function createCalendarEvent() {
  assertCalendarConnected();
  throw new ApiError(
    409,
    'CALENDAR_NOT_CONNECTED',
    'Google Calendar is not connected in this build.',
  );
}
