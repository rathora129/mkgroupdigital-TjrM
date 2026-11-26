import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { getDb, isDatabaseConfigured } from '@/db/client';
import { users, verificationTokens } from '@/db/schema';
import { createEmailProvider } from '@/lib/auth/email-provider';
import { normalizeEmailIdentifier } from '@/lib/auth/email-normalization';
import { hashEmail } from '@/lib/auth/hash';
import { rateLimit } from '@/lib/rate-limit';
import { recordAudit } from '@/lib/audit';
import {
  findMembershipForUser,
  isEmailAllowed,
  provisionWorkspaceAccess,
} from '@/lib/workspace/service';

const DEFAULT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function sessionMaxAgeSeconds() {
  const value = Number.parseInt(process.env.SESSION_MAX_AGE_SECONDS || '', 10);
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_SESSION_MAX_AGE_SECONDS;
}

// NextAuth is initialized lazily so nothing here runs at module evaluation.
// `next build` therefore never needs DATABASE_URL or AUTH_SECRET.
let cachedAdapter;

function getAdapter() {
  if (!cachedAdapter) {
    cachedAdapter = DrizzleAdapter(getDb(), {
      usersTable: users,
      verificationTokensTable: verificationTokens,
    });
  }
  return cachedAdapter;
}

function buildConfig() {
  const config = {
    session: {
      strategy: 'jwt',
      maxAge: sessionMaxAgeSeconds(),
    },
    secret: process.env.AUTH_SECRET,
    // AUTH_URL overrides the request origin whenever it is set; production
    // readiness requires it so emailed links cannot be pinned to a spoofed
    // Host header.
    trustHost: true,
    pages: {
      signIn: '/workspace/login',
      error: '/workspace/login',
    },
    providers: [createEmailProvider()],
    callbacks: {
      async signIn({ user, email }) {
        // Same canonicalizer as the provider, so the request stage, the
        // verification stage and stored invitations compare identical values.
        const address = normalizeEmailIdentifier(user?.email);
        if (!address) return false;

        const isVerificationRequest = email?.verificationRequest === true;

        if (isVerificationRequest) {
          const limit = rateLimit(`magic-link:${address}`, {
            limit: 5,
            windowMs: 10 * 60 * 1000,
          });
          if (!limit.ok) {
            await recordAudit({
              actorType: 'anonymous',
              action: 'auth.signin.rate_limited',
              metadata: { emailHash: hashEmail(address) },
            });
            return false;
          }
        }

        try {
          const allowed = await isEmailAllowed(address);
          if (!allowed) {
            await recordAudit({
              actorType: 'anonymous',
              action: 'auth.signin.denied',
              metadata: {
                emailHash: hashEmail(address),
                stage: isVerificationRequest ? 'request' : 'verification',
              },
            });
          }
          return allowed;
        } catch {
          console.error('[auth] access check failed');
          return false;
        }
      },
      async jwt({ token, user }) {
        if (user?.id) token.sub = user.id;
        return token;
      },
      async session({ session, token }) {
        if (session.user && token.sub) {
          session.user.id = token.sub;
        }
        return session;
      },
    },
    events: {
      async signIn({ user, isNewUser }) {
        try {
          const access = await provisionWorkspaceAccess({
            userId: user.id,
            email: user.email,
            isNewUser: Boolean(isNewUser),
          });
          await recordAudit({
            workspaceId: access.workspaceId,
            actorUserId: user.id,
            action: 'auth.signin',
            resourceType: 'session',
            metadata: {
              isNewUser: Boolean(isNewUser),
              source: access.source,
            },
          });
        } catch {
          console.error('[auth] workspace provisioning failed after sign-in');
        }
      },
      async signOut({ token }) {
        try {
          if (!token?.sub) return;
          const access = await findMembershipForUser(token.sub);
          await recordAudit({
            workspaceId: access?.workspace?.id || null,
            actorUserId: token.sub,
            action: 'auth.signout',
            resourceType: 'session',
          });
        } catch {
          console.error('[auth] sign-out could not be recorded');
        }
      },
    },
  };

  // Without a database there is no user store, so the adapter is omitted and
  // every sign-in path fails closed instead of crashing the request.
  if (isDatabaseConfigured()) {
    config.adapter = getAdapter();
  }

  return config;
}

export const { handlers, auth, signIn, signOut } = NextAuth(buildConfig);
