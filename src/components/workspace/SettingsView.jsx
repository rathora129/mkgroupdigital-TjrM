'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Clock,
  Copy,
  Loader2,
  MailPlus,
  Palette,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import styled from 'styled-components';
import { workspaceMedia } from '@/styles/workspaceTheme';
import { ROLE_LABELS, canActOnMember } from '@/lib/auth/permissions';
import { formatAuditAction } from '@/lib/audit-labels';

const DATE_FORMATS = ['DD MMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const WEEK_STARTS = ['monday', 'sunday'];

const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
];

function buildTimezoneOptions(current) {
  let supported = [];
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      supported = Intl.supportedValuesOf('timeZone');
    }
  } catch {
    supported = [];
  }
  const list = supported.length ? [...supported] : [...FALLBACK_TIMEZONES];
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1040px;
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Eyebrow = styled.p`
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.primary};
`;

const Title = styled.h1`
  font-size: clamp(1.5rem, 3vw, 1.9rem);
  letter-spacing: -0.025em;
`;

const Lead = styled.p`
  max-width: 660px;
  font-size: 0.88rem;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.muted};
`;

const Notice = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 11px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid
    ${({ theme, $tone }) =>
      $tone === 'danger' ? theme.colors.danger : theme.colors.success};
  background: ${({ theme, $tone }) =>
    $tone === 'danger' ? theme.colors.dangerSoft : theme.colors.successSoft};
  color: ${({ theme, $tone }) =>
    $tone === 'danger' ? theme.colors.danger : theme.colors.success};
  font-size: 0.8rem;
  line-height: 1.55;
  word-break: break-word;

  svg {
    flex-shrink: 0;
    margin-top: 1px;
  }
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: clamp(18px, 3vw, 24px);
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const SectionHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;

  h2 {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 1rem;
    letter-spacing: -0.01em;
  }

  p {
    margin-top: 4px;
    font-size: 0.8rem;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const RoleBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid
    ${({ theme, $primary }) =>
      $primary ? theme.colors.primaryBorder : theme.colors.border};
  background: ${({ theme, $primary }) =>
    $primary ? theme.colors.primarySoft : theme.colors.surface};
  color: ${({ theme, $primary }) =>
    $primary ? theme.colors.primary : theme.colors.muted};
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid
    ${({ theme, $tone }) => {
      if ($tone === 'success') return theme.colors.success;
      if ($tone === 'warning') return theme.colors.warning;
      if ($tone === 'danger') return theme.colors.danger;
      return theme.colors.borderStrong;
    }};
  background: ${({ theme, $tone }) => {
    if ($tone === 'success') return theme.colors.successSoft;
    if ($tone === 'warning') return theme.colors.warningSoft;
    if ($tone === 'danger') return theme.colors.dangerSoft;
    return theme.colors.surface;
  }};
  color: ${({ theme, $tone }) => {
    if ($tone === 'success') return theme.colors.success;
    if ($tone === 'warning') return theme.colors.warning;
    if ($tone === 'danger') return theme.colors.danger;
    return theme.colors.muted;
  }};
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;

  ${workspaceMedia.down('sm')} {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const FieldFull = styled(Field)`
  grid-column: 1 / -1;
`;

const Label = styled.label`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSoft};
`;

const Hint = styled.span`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Input = styled.input`
  min-height: 40px;
  padding: 0 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.bg};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.84rem;

  &:disabled {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Textarea = styled.textarea`
  min-height: 76px;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.bg};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.84rem;
  font-family: inherit;
  resize: vertical;

  &:disabled {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const ColorRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ColorSwatch = styled.input`
  width: 44px;
  height: 40px;
  padding: 3px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.bg};
  cursor: pointer;
`;

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 600;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primaryHover};
  }

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
`;

const GhostButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 10px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.bg};
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.74rem;
  font-weight: 600;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primaryBorder};
    color: ${({ theme }) => theme.colors.primary};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const DangerButton = styled(GhostButton)`
  border-color: ${({ theme }) => theme.colors.danger};
  color: ${({ theme }) => theme.colors.danger};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.danger};
    background: ${({ theme }) => theme.colors.dangerSoft};
    color: ${({ theme }) => theme.colors.danger};
  }
`;

const Meta = styled.dl`
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 0.76rem;

  dt {
    color: ${({ theme }) => theme.colors.muted};
  }

  dd {
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.mono};
    color: ${({ theme }) => theme.colors.textSoft};
  }
`;

const MemberList = styled.ul`
  display: flex;
  flex-direction: column;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const MemberItem = styled.li`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const MemberRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px auto;
  align-items: center;
  gap: 12px;
  padding: 12px 2px;

  ${workspaceMedia.down('sm')} {
    grid-template-columns: 1fr;
    gap: 10px;
  }
`;

const Identity = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const AvatarSmall = styled.span`
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.colors.primaryBorder};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
`;

const IdentityCopy = styled.div`
  min-width: 0;
`;

const MemberName = styled.p`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const YouTag = styled.span`
  padding: 1px 6px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.surfaceMuted};
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const MemberEmail = styled.p`
  font-size: 0.74rem;
  color: ${({ theme }) => theme.colors.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RowActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;

  ${workspaceMedia.down('sm')} {
    justify-content: flex-start;
  }
`;

const Select = styled.select`
  width: 100%;
  min-height: 32px;
  padding: 0 8px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.bg};
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.76rem;
`;

const HistoryPanel = styled.div`
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px dashed ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.surface};
`;

const HistoryList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const HistoryItem = styled.li`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textSoft};

  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 0.7rem;
  }
`;

const InviteForm = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;

  ${workspaceMedia.down('sm')} {
    grid-template-columns: 1fr;
  }
`;

const InviteList = styled.ul`
  display: flex;
  flex-direction: column;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const InviteRow = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 2px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  ${workspaceMedia.down('md')} {
    grid-template-columns: 1fr;
    gap: 8px;
  }
`;

const InviteCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  strong {
    font-size: 0.8rem;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text};
    overflow-wrap: anywhere;
  }

  span {
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const InviteMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Empty = styled.p`
  padding: 14px 2px 4px;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const RoleReference = styled.ul`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 20px;
  font-size: 0.78rem;
  color: ${({ theme }) => theme.colors.textSoft};

  ${workspaceMedia.down('sm')} {
    grid-template-columns: 1fr;
  }

  strong {
    color: ${({ theme }) => theme.colors.text};
  }
`;

function initialsFor(name, email) {
  const source = String(name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatDate(value, timeZone) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: timeZone || undefined,
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

function formatDateTime(value, timeZone) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone || undefined,
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

function roleLabel(role) {
  return ROLE_LABELS[role] || role || 'Member';
}

function invitationTone(status) {
  if (status === 'accepted') return 'success';
  if (status === 'expired') return 'warning';
  if (status === 'revoked') return 'danger';
  return 'neutral';
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    const message =
      payload?.error?.message || 'The request could not be completed.';
    throw new Error(message);
  }

  return payload.data;
}

export default function SettingsView({
  workspace,
  viewer,
  members,
  invitations,
  permissions,
  assignableRoles,
}) {
  const router = useRouter();
  const timeZone = workspace.timezone || 'UTC';

  const canEditWorkspace = permissions.includes('workspace.edit');
  const canManageMembers = permissions.includes('members.manage');
  const canManageInvitations = permissions.includes('members.invite');
  const canViewAudit = permissions.includes('audit.view');

  const [timezoneOptions] = useState(() =>
    buildTimezoneOptions(workspace.timezone || 'UTC'),
  );
  const [profile, setProfile] = useState({
    name: workspace.name || '',
    timezone: workspace.timezone || 'UTC',
    businessEmail: workspace.businessEmail || '',
    businessPhone: workspace.businessPhone || '',
    businessAddress: workspace.businessAddress || '',
    websiteUrl: workspace.websiteUrl || '',
    brandColor: workspace.brandColor || '#4F46E5',
    logoUrl: workspace.logoUrl || '',
    dateFormat: workspace.preferences?.dateFormat || DATE_FORMATS[0],
    weekStart: workspace.preferences?.weekStart || WEEK_STARTS[0],
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState(
    assignableRoles.includes('member') ? 'member' : assignableRoles[0] || 'member',
  );
  const [inviting, setInviting] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState(null);
  const [busyInviteId, setBusyInviteId] = useState(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [historyOpenId, setHistoryOpenId] = useState(null);
  const [historyById, setHistoryById] = useState({});
  const [historyBusyId, setHistoryBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  function showNotice(tone, text) {
    setNotice({ tone, text });
  }

  function setField(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!canEditWorkspace || savingProfile) return;

    setSavingProfile(true);
    setNotice(null);
    try {
      const data = await requestJson('/api/workforce/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profile.name,
          timezone: profile.timezone,
          businessEmail: profile.businessEmail,
          businessPhone: profile.businessPhone,
          businessAddress: profile.businessAddress,
          websiteUrl: profile.websiteUrl,
          brandColor: profile.brandColor,
          logoUrl: profile.logoUrl,
          preferences: {
            dateFormat: profile.dateFormat,
            weekStart: profile.weekStart,
          },
        }),
      });
      setProfile((current) => ({
        ...current,
        name: data.workspace.name,
        timezone: data.workspace.timezone,
        businessEmail: data.workspace.businessEmail || '',
        businessPhone: data.workspace.businessPhone || '',
        businessAddress: data.workspace.businessAddress || '',
        websiteUrl: data.workspace.websiteUrl || '',
        brandColor: data.workspace.brandColor || current.brandColor,
        logoUrl: data.workspace.logoUrl || '',
        dateFormat:
          data.workspace.preferences?.dateFormat || current.dateFormat,
        weekStart: data.workspace.preferences?.weekStart || current.weekStart,
      }));
      showNotice('success', 'Workspace profile updated.');
      router.refresh();
    } catch (error) {
      showNotice('danger', error.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function sendInvitation(event) {
    event.preventDefault();
    if (!canManageInvitations || inviting) return;

    setInviting(true);
    setNotice(null);
    try {
      const data = await requestJson('/api/workforce/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteEmail('');
      showNotice(
        'success',
        data.emailDelivered
          ? `Invitation sent as ${roleLabel(data.invitation.role)}. The sign-in link expires in 7 days.`
          : 'Invitation created. Email delivery is not configured, so share the sign-in link manually.',
      );
      router.refresh();
    } catch (error) {
      showNotice('danger', error.message);
    } finally {
      setInviting(false);
    }
  }

  async function resendInvite(id) {
    if (busyInviteId) return;

    setBusyInviteId(id);
    setNotice(null);
    try {
      const data = await requestJson(
        `/api/workforce/invitations/${id}/resend`,
        { method: 'POST' },
      );
      showNotice(
        'success',
        data.emailDelivered
          ? 'Invitation resent. The sign-in link expires in 7 days.'
          : 'Invitation renewed. Email delivery is not configured, so share the sign-in link manually.',
      );
      router.refresh();
    } catch (error) {
      showNotice('danger', error.message);
    } finally {
      setBusyInviteId(null);
    }
  }

  async function revokeInvite(id) {
    if (busyInviteId) return;

    setBusyInviteId(id);
    setNotice(null);
    try {
      await requestJson(`/api/workforce/invitations/${id}`, {
        method: 'DELETE',
      });
      showNotice('success', 'Invitation revoked.');
      router.refresh();
    } catch (error) {
      showNotice('danger', error.message);
    } finally {
      setBusyInviteId(null);
    }
  }

  async function copyInviteLink(email) {
    const url = `${window.location.origin}/workspace/login?email=${encodeURIComponent(email)}`;
    try {
      await navigator.clipboard.writeText(url);
      showNotice('success', 'Sign-in link copied to the clipboard.');
    } catch {
      showNotice('danger', `Copy this link manually: ${url}`);
    }
  }

  async function changeRole(memberId, role) {
    if (busyMemberId) return;

    setBusyMemberId(memberId);
    setNotice(null);
    try {
      await requestJson(`/api/workforce/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      showNotice('success', 'Member role updated.');
      router.refresh();
    } catch (error) {
      showNotice('danger', error.message);
    } finally {
      setBusyMemberId(null);
    }
  }

  async function removeMember(memberId) {
    if (busyMemberId) return;

    setBusyMemberId(memberId);
    setNotice(null);
    try {
      await requestJson(`/api/workforce/members/${memberId}`, {
        method: 'DELETE',
      });
      setConfirmRemoveId(null);
      showNotice('success', 'Member removed from the workspace.');
      router.refresh();
    } catch (error) {
      showNotice('danger', error.message);
    } finally {
      setBusyMemberId(null);
    }
  }

  async function toggleHistory(memberId) {
    if (historyOpenId === memberId) {
      setHistoryOpenId(null);
      return;
    }

    setHistoryOpenId(memberId);
    if (historyById[memberId] || historyBusyId) return;

    setHistoryBusyId(memberId);
    try {
      const data = await requestJson(
        `/api/workforce/members/${memberId}/history`,
      );
      setHistoryById((current) => ({
        ...current,
        [memberId]: data.history,
      }));
    } catch (error) {
      showNotice('danger', error.message);
      setHistoryOpenId(null);
    } finally {
      setHistoryBusyId(null);
    }
  }

  function selectableRolesFor(member) {
    const options = new Set(assignableRoles);
    options.add(member.role);
    return [...options];
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Phase 2A · Foundations</Eyebrow>
        <Title>Workspace settings</Title>
        <Lead>
          Manage the workspace profile, branding, member access and
          invitations. Every change is checked against your workspace role on
          the server.
        </Lead>
      </Header>

      {notice ? (
        <Notice $tone={notice.tone} role="status" aria-live="polite">
          {notice.tone === 'success' ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <X size={15} aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </Notice>
      ) : null}

      <Section aria-labelledby="settings-profile">
        <SectionHead>
          <div>
            <h2 id="settings-profile">
              <Palette size={16} aria-hidden="true" /> Workspace profile
            </h2>
            <p>
              Shown to every member. The slug is fixed because it identifies
              stored workspace data.
            </p>
          </div>
          <RoleBadge $primary>
            <ShieldCheck size={12} aria-hidden="true" />
            Your role: {roleLabel(viewer.role)}
          </RoleBadge>
        </SectionHead>

        <Form onSubmit={saveProfile}>
          <Grid>
            <Field>
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                name="name"
                value={profile.name}
                onChange={(event) => setField('name', event.target.value)}
                disabled={!canEditWorkspace || savingProfile}
                maxLength={80}
                required
              />
            </Field>
            <Field>
              <Label htmlFor="workspace-timezone">Timezone</Label>
              <Select
                id="workspace-timezone"
                value={profile.timezone}
                onChange={(event) => setField('timezone', event.target.value)}
                disabled={!canEditWorkspace || savingProfile}
              >
                {timezoneOptions.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label htmlFor="workspace-email">Business email</Label>
              <Input
                id="workspace-email"
                type="email"
                name="businessEmail"
                value={profile.businessEmail}
                onChange={(event) =>
                  setField('businessEmail', event.target.value)
                }
                disabled={!canEditWorkspace || savingProfile}
                maxLength={254}
              />
            </Field>
            <Field>
              <Label htmlFor="workspace-phone">Business phone</Label>
              <Input
                id="workspace-phone"
                name="businessPhone"
                value={profile.businessPhone}
                onChange={(event) =>
                  setField('businessPhone', event.target.value)
                }
                disabled={!canEditWorkspace || savingProfile}
                maxLength={40}
              />
            </Field>
            <Field>
              <Label htmlFor="workspace-website">Website</Label>
              <Input
                id="workspace-website"
                name="websiteUrl"
                placeholder="https://example.com"
                value={profile.websiteUrl}
                onChange={(event) =>
                  setField('websiteUrl', event.target.value)
                }
                disabled={!canEditWorkspace || savingProfile}
              />
            </Field>
            <Field>
              <Label htmlFor="workspace-logo">Logo URL</Label>
              <Input
                id="workspace-logo"
                name="logoUrl"
                placeholder="https://example.com/logo.svg"
                value={profile.logoUrl}
                onChange={(event) => setField('logoUrl', event.target.value)}
                disabled={!canEditWorkspace || savingProfile}
              />
            </Field>
            <FieldFull>
              <Label htmlFor="workspace-address">Business address</Label>
              <Textarea
                id="workspace-address"
                name="businessAddress"
                value={profile.businessAddress}
                onChange={(event) =>
                  setField('businessAddress', event.target.value)
                }
                disabled={!canEditWorkspace || savingProfile}
                maxLength={500}
              />
            </FieldFull>
            <Field>
              <Label htmlFor="workspace-brand-color">Brand colour</Label>
              <ColorRow>
                <ColorSwatch
                  type="color"
                  aria-label="Brand colour"
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(profile.brandColor)
                      ? profile.brandColor
                      : '#4F46E5'
                  }
                  onChange={(event) =>
                    setField('brandColor', event.target.value)
                  }
                  disabled={!canEditWorkspace || savingProfile}
                />
                <Input
                  id="workspace-brand-color"
                  value={profile.brandColor}
                  onChange={(event) =>
                    setField('brandColor', event.target.value)
                  }
                  disabled={!canEditWorkspace || savingProfile}
                  maxLength={7}
                />
              </ColorRow>
            </Field>
            <Field>
              <Label htmlFor="workspace-date-format">Date format</Label>
              <Select
                id="workspace-date-format"
                value={profile.dateFormat}
                onChange={(event) =>
                  setField('dateFormat', event.target.value)
                }
                disabled={!canEditWorkspace || savingProfile}
              >
                {DATE_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label htmlFor="workspace-week-start">Week starts on</Label>
              <Select
                id="workspace-week-start"
                value={profile.weekStart}
                onChange={(event) => setField('weekStart', event.target.value)}
                disabled={!canEditWorkspace || savingProfile}
              >
                {WEEK_STARTS.map((day) => (
                  <option key={day} value={day}>
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
          </Grid>

          <ButtonRow>
            {canEditWorkspace ? (
              <PrimaryButton
                type="submit"
                disabled={savingProfile || !profile.name.trim()}
              >
                {savingProfile ? (
                  <>
                    <Loader2 size={14} className="spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  'Save profile'
                )}
              </PrimaryButton>
            ) : (
              <Hint>Only owners and admins can edit the workspace profile.</Hint>
            )}
            <Meta>
              <dt>Workspace slug</dt>
              <dd>{workspace.slug}</dd>
            </Meta>
          </ButtonRow>
        </Form>
      </Section>

      <Section aria-labelledby="settings-members">
        <SectionHead>
          <div>
            <h2 id="settings-members">
              <UserRound size={16} aria-hidden="true" /> Members
            </h2>
            <p>
              {members.length}{' '}
              {members.length === 1 ? 'person has' : 'people have'} access to
              this workspace.
            </p>
          </div>
          {canViewAudit ? (
            <RoleBadge as="a" href="/workspace/audit">
              <Clock size={12} aria-hidden="true" /> Audit log
            </RoleBadge>
          ) : null}
        </SectionHead>

        <MemberList>
          {members.map((member) => {
            const self = member.userId === viewer.id;
            const busy = busyMemberId === member.id;
            const editable =
              canManageMembers && canActOnMember(viewer.role, member.role);
            const historyOpen = historyOpenId === member.id;
            const history = historyById[member.id];

            return (
              <MemberItem key={member.id}>
                <MemberRow>
                  <Identity>
                    <AvatarSmall aria-hidden="true">
                      {initialsFor(member.name, member.email)}
                    </AvatarSmall>
                    <IdentityCopy>
                      <MemberName>
                        {member.name || member.email}
                        {self ? <YouTag>You</YouTag> : null}
                      </MemberName>
                      <MemberEmail>{member.email}</MemberEmail>
                    </IdentityCopy>
                  </Identity>

                  {editable ? (
                    <Select
                      aria-label={`Role for ${member.email}`}
                      value={member.role}
                      disabled={busy}
                      onChange={(event) =>
                        changeRole(member.id, event.target.value)
                      }
                    >
                      {selectableRolesFor(member).map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <RoleBadge $primary={member.role === 'owner'}>
                      {roleLabel(member.role)}
                    </RoleBadge>
                  )}

                  <RowActions>
                    <GhostButton
                      type="button"
                      onClick={() => toggleHistory(member.id)}
                    >
                      <Clock size={13} aria-hidden="true" />
                      {historyOpen ? 'Hide history' : 'History'}
                    </GhostButton>
                    {editable ? (
                      confirmRemoveId === member.id ? (
                        <>
                          <DangerButton
                            type="button"
                            disabled={busy}
                            onClick={() => removeMember(member.id)}
                          >
                            {busy ? 'Removing…' : 'Confirm remove'}
                          </DangerButton>
                          <GhostButton
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmRemoveId(null)}
                          >
                            Cancel
                          </GhostButton>
                        </>
                      ) : (
                        <DangerButton
                          type="button"
                          onClick={() => setConfirmRemoveId(member.id)}
                        >
                          <Trash2 size={13} aria-hidden="true" /> Remove
                        </DangerButton>
                      )
                    ) : null}
                  </RowActions>
                </MemberRow>

                {historyOpen ? (
                  <HistoryPanel>
                    {historyBusyId === member.id ? (
                      <Empty>Loading history…</Empty>
                    ) : history?.length ? (
                      <HistoryList>
                        {history.map((entry) => (
                          <HistoryItem key={entry.id}>
                            <div>
                              {formatAuditAction(entry.action)}
                              {entry.metadata?.from || entry.metadata?.to ? (
                                <span>
                                  {' '}
                                  (
                                  {entry.metadata.from
                                    ? roleLabel(entry.metadata.from)
                                    : '—'}{' '}
                                  →{' '}
                                  {entry.metadata.to
                                    ? roleLabel(entry.metadata.to)
                                    : '—'}
                                  )
                                </span>
                              ) : null}
                              {entry.success === false ? (
                                <span> · rejected</span>
                              ) : null}
                            </div>
                            <span>{formatDateTime(entry.createdAt, timeZone)}</span>
                          </HistoryItem>
                        ))}
                      </HistoryList>
                    ) : (
                      <Empty>No recorded history for this membership yet.</Empty>
                    )}
                  </HistoryPanel>
                ) : null}
              </MemberItem>
            );
          })}
        </MemberList>
      </Section>

      {canManageInvitations ? (
        <Section aria-labelledby="settings-invitations">
          <SectionHead>
            <div>
              <h2 id="settings-invitations">
                <MailPlus size={16} aria-hidden="true" /> Invitations
              </h2>
              <p>
                Invited addresses can request a one-time sign-in link. Invites
                expire after 7 days and can be resent or revoked at any time
                before acceptance.
              </p>
            </div>
          </SectionHead>

          <InviteForm onSubmit={sendInvitation}>
            <Field>
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                inputMode="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                disabled={inviting}
                required
              />
            </Field>
            <Field>
              <Label htmlFor="invite-role">Role</Label>
              <Select
                id="invite-role"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
                disabled={inviting}
              >
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </Select>
            </Field>
            <PrimaryButton
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
            >
              {inviting ? (
                <>
                  <Loader2 size={14} className="spin" aria-hidden="true" />
                  Creating…
                </>
              ) : (
                <>
                  <MailPlus size={15} aria-hidden="true" /> Invite
                </>
              )}
            </PrimaryButton>
          </InviteForm>

          {invitations.length ? (
            <InviteList>
              {invitations.map((invitation) => {
                const busy = busyInviteId === invitation.id;
                const active = invitation.status === 'pending';

                return (
                  <InviteRow key={invitation.id}>
                    <InviteCopy>
                      <strong>{invitation.email}</strong>
                      <span>
                        Invited {formatDate(invitation.createdAt, timeZone)}
                        {invitation.status === 'accepted'
                          ? ` · accepted ${formatDate(invitation.acceptedAt, timeZone)}`
                          : ` · expires ${formatDate(invitation.expiresAt, timeZone)}`}
                      </span>
                    </InviteCopy>

                    <InviteMeta>
                      <RoleBadge>{roleLabel(invitation.role)}</RoleBadge>
                      <StatusBadge $tone={invitationTone(invitation.status)}>
                        {invitation.status}
                      </StatusBadge>
                    </InviteMeta>

                    <RowActions>
                      {active ? (
                        <GhostButton
                          type="button"
                          onClick={() => copyInviteLink(invitation.email)}
                        >
                          <Copy size={13} aria-hidden="true" /> Copy link
                        </GhostButton>
                      ) : null}
                      {invitation.status !== 'accepted' ? (
                        <GhostButton
                          type="button"
                          disabled={busy}
                          onClick={() => resendInvite(invitation.id)}
                        >
                          <RefreshCw size={13} aria-hidden="true" />
                          {busy ? 'Sending…' : 'Resend'}
                        </GhostButton>
                      ) : null}
                      {invitation.status !== 'accepted' ? (
                        <DangerButton
                          type="button"
                          disabled={busy || invitation.status === 'revoked'}
                          onClick={() => revokeInvite(invitation.id)}
                        >
                          {busy ? 'Working…' : 'Revoke'}
                        </DangerButton>
                      ) : null}
                    </RowActions>
                  </InviteRow>
                );
              })}
            </InviteList>
          ) : (
            <Empty>No invitations yet.</Empty>
          )}
        </Section>
      ) : null}

      <Section aria-labelledby="settings-roles">
        <SectionHead>
          <div>
            <h2 id="settings-roles">Roles</h2>
            <p>
              Roles control what a member can do across the workspace. Access
              checks run on the server for every request.
            </p>
          </div>
        </SectionHead>
        <RoleReference>
          <li>
            <strong>Owner</strong> — full control, including other owners.
          </li>
          <li>
            <strong>Admin</strong> — manages members, invitations, settings and
            the audit log.
          </li>
          <li>
            <strong>Manager</strong> — read access to workspace and members.
          </li>
          <li>
            <strong>Member</strong> — reads the workspace.
          </li>
          <li>
            <strong>Specialist</strong> — reads the workspace.
          </li>
          <li>
            <strong>Viewer</strong> — read-only access.
          </li>
        </RoleReference>
      </Section>
    </Page>
  );
}
