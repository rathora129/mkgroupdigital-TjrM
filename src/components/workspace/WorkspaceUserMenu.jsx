'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ExternalLink,
  LogOut,
  Settings,
} from 'lucide-react';
import styled from 'styled-components';
import { workspaceMedia } from '@/styles/workspaceTheme';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { logoutAction } from '@/app/workspace/actions';

const Wrap = styled.div`
  position: relative;
`;

const Trigger = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px 3px 3px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBorder};
    background: ${({ theme }) => theme.colors.surface};
  }
`;

const Avatar = styled.span`
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  flex-shrink: 0;
`;

const Meta = styled.span`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
  min-width: 0;

  ${workspaceMedia.down('sm')} {
    display: none;
  }
`;

const MetaName = styled.span`
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const MetaRole = styled.span`
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Panel = styled.div`
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 60;
  width: 252px;
  padding: 6px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  box-shadow: ${({ theme }) => theme.shadow.raised};
`;

const PanelHead = styled.div`
  padding: 9px 10px 11px;
  margin-bottom: 6px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const PanelName = styled.p`
  font-size: 0.82rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PanelEmail = styled.p`
  margin-top: 2px;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RoleChip = styled.span`
  display: inline-flex;
  margin-top: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.primaryBorder};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const Item = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: 0.8rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSoft};

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const SignOut = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  margin-top: 4px;
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: 0.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.danger};

  &:hover {
    background: ${({ theme }) => theme.colors.dangerSoft};
  }
`;

function initialsFor(name, email) {
  const source = String(name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function WorkspaceUserMenu({ user, workspace }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = user?.name || user?.email || 'Account';
  const roleLabel = ROLE_LABELS[workspace?.role] || 'Member';

  return (
    <Wrap ref={wrapRef}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar aria-hidden="true">{initialsFor(user?.name, user?.email)}</Avatar>
        <Meta>
          <MetaName>{label}</MetaName>
          <MetaRole>{roleLabel}</MetaRole>
        </Meta>
        <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
      </Trigger>

      {open ? (
        <Panel role="menu" aria-label="Account menu">
          <PanelHead>
            <PanelName>{label}</PanelName>
            {user?.email ? <PanelEmail>{user.email}</PanelEmail> : null}
            <RoleChip>{roleLabel}</RoleChip>
          </PanelHead>

          <Item
            href="/workspace/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Settings size={15} aria-hidden="true" /> Workspace settings
          </Item>

          <Item
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <ExternalLink size={15} aria-hidden="true" /> Public website
          </Item>

          <form action={logoutAction}>
            <SignOut type="submit" role="menuitem">
              <LogOut size={15} aria-hidden="true" /> Sign out
            </SignOut>
          </form>
        </Panel>
      ) : null}
    </Wrap>
  );
}
