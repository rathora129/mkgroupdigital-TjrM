'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, ChevronRight, Menu, Sparkles, X } from 'lucide-react';
import styled, { ThemeProvider } from 'styled-components';
import workspaceTheme, { workspaceMedia } from '@/styles/workspaceTheme';
import { workspaceNav } from '@/data/workspace';
import WorkspaceGlobalStyles from './WorkspaceGlobalStyles';
import WorkspaceUserMenu from './WorkspaceUserMenu';

const Shell = styled.div`
  min-height: 100dvh;
  background: ${({ theme }) => theme.colors.bg};
`;

const Sidebar = styled.aside`
  position: fixed;
  inset-block: 0;
  left: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  width: ${({ theme }) => theme.sidebarWidth};
  padding: 18px 14px 16px;
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};

  ${workspaceMedia.down('lg')} {
    display: none;
  }
`;

const DrawerLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 80;

  ${workspaceMedia.up('lg')} {
    display: none;
  }
`;

const DrawerOverlay = styled(motion.div)`
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.42);
`;

const Drawer = styled(motion.div)`
  position: absolute;
  inset-block: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  width: min(300px, 86vw);
  padding: 14px 14px 16px;
  overflow-y: auto;
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  box-shadow: 24px 0 60px -30px rgba(15, 23, 42, 0.4);
`;

const DrawerHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 4px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  margin-bottom: 12px;

  p {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const CloseButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.muted};

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 4px 16px;
`;

const BrandMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.primaryBorder};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
`;

const BrandText = styled.div`
  min-width: 0;
`;

const BrandName = styled.p`
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.2;
`;

const BrandSub = styled.p`
  margin-top: 2px;
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Nav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px;
`;

const NavLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: ${({ theme }) => theme.radius.md};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.textSoft};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primarySoft : 'transparent'};
  font-size: 0.83rem;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  transition:
    background-color 0.2s ease,
    color 0.2s ease;

  svg {
    flex-shrink: 0;
    color: ${({ theme, $active }) =>
      $active ? theme.colors.primary : theme.colors.muted};
  }

  &:hover {
    background: ${({ theme, $active }) =>
      $active ? theme.colors.primarySoft : theme.colors.surfaceMuted};
    color: ${({ theme, $active }) =>
      $active ? theme.colors.primary : theme.colors.text};
  }
`;

const NavCount = styled.span`
  margin-left: auto;
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  font-size: 0.64rem;
  font-weight: 700;
  text-align: center;
  line-height: 1.5;
`;

const SidebarFooter = styled.div`
  margin-top: 12px;
  padding: 14px 4px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const PhasePill = styled.span`
  align-self: flex-start;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.primaryBorder};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const PublicLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.muted};

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100dvh;

  ${workspaceMedia.up('lg')} {
    margin-left: ${({ theme }) => theme.sidebarWidth};
  }
`;

const Topbar = styled.header`
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
`;

const TopbarInner = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  max-width: 1240px;
  margin-inline: auto;
  min-height: ${({ theme }) => theme.topbarHeight};
  padding: 0 clamp(14px, 3vw, 32px);
`;

const MenuButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSoft};
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }

  ${workspaceMedia.up('lg')} {
    display: none;
  }
`;

const Breadcrumb = styled.nav`
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.muted};

  a:hover {
    color: ${({ theme }) => theme.colors.text};
  }

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.faint};
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${({ theme }) => theme.colors.text};
    font-weight: 600;
  }
`;

const TopbarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
`;

const TopbarPhase = styled.span`
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;

  ${workspaceMedia.down('sm')} {
    display: none;
  }
`;

const TopbarLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.78rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSoft};
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }

  ${workspaceMedia.down('sm')} {
    display: none;
  }
`;

const Main = styled.main`
  flex: 1;
  width: 100%;
  max-width: 1240px;
  margin-inline: auto;
  padding: clamp(20px, 3vw, 32px) clamp(14px, 3vw, 32px) 64px;
`;

function matchesPath(item, pathname) {
  if (item.href === '/workspace') return pathname === '/workspace';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function SidebarContent({
  pathname,
  onNavigate,
  showBrand = true,
  workspaceName,
  navItems,
  notificationCount = 0,
}) {
  const activeHref = navItems
    .filter((item) => matchesPath(item, pathname))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  return (
    <>
      {showBrand ? (
        <Brand>
          <BrandMark>
            <Sparkles size={18} strokeWidth={1.9} aria-hidden="true" />
          </BrandMark>
          <BrandText>
            <BrandName>MK AI Workforce</BrandName>
            <BrandSub>{workspaceName || 'MK Group Digital'}</BrandSub>
          </BrandText>
        </Brand>
      ) : null}

      <Nav aria-label="Workspace navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === activeHref;

          return (
            <NavLink
              key={item.key}
              href={item.href}
              $active={active}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
              {item.key === 'notifications' && notificationCount > 0 ? (
                <NavCount aria-label={`${notificationCount} unread`}>
                  {notificationCount > 99 ? '99+' : notificationCount}
                </NavCount>
              ) : null}
            </NavLink>
          );
        })}
      </Nav>

      <SidebarFooter>
        <PhasePill>Phase 2H · Integration &amp; Automation</PhasePill>
        <PublicLink href="/" target="_blank" rel="noopener noreferrer">
          Public website <ArrowUpRight size={13} />
        </PublicLink>
      </SidebarFooter>
    </>
  );
}

export default function WorkspaceShell({
  children,
  user,
  workspace,
  permissions = [],
  notificationCount = 0,
}) {
  const pathname = usePathname() || '/workspace';
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeRef = useRef(null);

  const navItems = workspaceNav.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );

  const current =
    navItems.find((item) => item.href === pathname) ||
    navItems
      .filter((item) => item.href !== '/workspace' && matchesPath(item, pathname))
      .sort((left, right) => right.href.length - left.href.length)[0] ||
    navItems[0];

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    const onPopState = () => setMobileOpen(false);

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('popstate', onPopState);
    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPopState);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  return (
    <ThemeProvider theme={workspaceTheme}>
      <WorkspaceGlobalStyles />
      <Shell className="workspace-root">
        <a className="workspace-skip" href="#workspace-main">
          Skip to workspace content
        </a>

        <Sidebar>
          <SidebarContent
            pathname={pathname}
            workspaceName={workspace?.name}
            navItems={navItems}
            notificationCount={notificationCount}
          />
        </Sidebar>

        <Column>
          <Topbar>
            <TopbarInner>
              <MenuButton
                type="button"
                aria-label="Open workspace navigation"
                aria-expanded={mobileOpen}
                aria-controls="workspace-drawer"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={19} strokeWidth={1.9} />
              </MenuButton>

              <Breadcrumb aria-label="Breadcrumb">
                <Link href="/workspace">Workspace</Link>
                <ChevronRight size={13} aria-hidden="true" />
                <span aria-current="page">{current.label}</span>
              </Breadcrumb>

              <TopbarActions>
                <TopbarPhase>Phase 2H · Integration &amp; Automation</TopbarPhase>
                <TopbarLink href="/" target="_blank" rel="noopener noreferrer">
                  Public website <ArrowUpRight size={13} />
                </TopbarLink>
                <WorkspaceUserMenu user={user} workspace={workspace} />
              </TopbarActions>
            </TopbarInner>
          </Topbar>

          <Main id="workspace-main">{children}</Main>
        </Column>

        <AnimatePresence>
          {mobileOpen ? (
            <DrawerLayer key="workspace-drawer-layer">
              <DrawerOverlay
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setMobileOpen(false)}
              />
              <Drawer
                id="workspace-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Workspace navigation"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              >
                <DrawerHead>
                  <p>Navigation</p>
                  <CloseButton
                    ref={closeRef}
                    type="button"
                    aria-label="Close workspace navigation"
                    onClick={() => setMobileOpen(false)}
                  >
                    <X size={18} strokeWidth={1.9} />
                  </CloseButton>
                </DrawerHead>
                <SidebarContent
                  pathname={pathname}
                  workspaceName={workspace?.name}
                  onNavigate={() => setMobileOpen(false)}
                  navItems={navItems}
                  notificationCount={notificationCount}
                />
              </Drawer>
            </DrawerLayer>
          ) : null}
        </AnimatePresence>
      </Shell>
    </ThemeProvider>
  );
}
