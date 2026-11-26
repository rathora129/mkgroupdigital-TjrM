'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AnimatePresence,
  motion,
  useScroll,
  useSpring,
} from 'framer-motion';
import {
  ArrowUpRight,
  ChevronDown,
  Mail,
  Menu,
  MessageCircle,
  X,
} from 'lucide-react';
import styled, { css } from 'styled-components';
import BrandLogo from '@/components/ui/BrandLogo';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import AnnouncementBar from './AnnouncementBar';
import { serviceCategories } from '@/data/services';
import { industries } from '@/data/industries';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const Wrapper = styled.header`
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.z.header};
  background: ${({ $scrolled }) =>
    $scrolled ? 'rgba(7, 7, 12, 0.82)' : 'transparent'};
  backdrop-filter: ${({ $scrolled }) => ($scrolled ? 'blur(18px) saturate(140%)' : 'none')};
  border-bottom: 1px solid
    ${({ $scrolled, theme }) => ($scrolled ? theme.colors.line : 'transparent')};
  transition:
    background-color 0.35s ease,
    border-color 0.35s ease,
    backdrop-filter 0.35s ease;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(7, 7, 12, 0.55), transparent);
    opacity: ${({ $scrolled }) => ($scrolled ? 0 : 1)};
    transition: opacity 0.35s ease;
    pointer-events: none;
    z-index: -1;
  }
`;

const Inner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  width: 100%;
  max-width: 1420px;
  margin-inline: auto;
  padding: ${({ $scrolled }) => ($scrolled ? '0.7rem' : '1rem')} clamp(1.25rem, 4vw, 2.75rem);
  transition: padding 0.35s ease;

  ${media.down('lg')} {
    padding-block: 0.75rem;
  }
`;

const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: 0.2rem;

  ${media.down('lg')} {
    display: none;
  }
`;

const NavLink = styled(Link)`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.8rem;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.muted};
  transition:
    color 0.25s ease,
    background-color 0.25s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    background: rgba(255, 255, 255, 0.035);
  }

  ${({ $active, theme }) =>
    $active &&
    css`
      color: ${theme.colors.text};

      &::after {
        content: '';
        position: absolute;
        bottom: 2px;
        left: 50%;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: ${theme.colors.violet};
        box-shadow: 0 0 10px ${theme.colors.violet};
        transform: translateX(-50%);
      }
    `}
`;

const ServiceArea = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;

  &:hover ${NavLink} {
    color: ${({ theme }) => theme.colors.text};
    background: rgba(255, 255, 255, 0.035);
  }
`;

const Chevron = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: -0.5rem;
  border-radius: 50%;
  color: ${({ theme }) => theme.colors.muted};
  transition:
    transform 0.3s ease,
    color 0.25s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Mega = styled(motion.div)`
  position: absolute;
  top: calc(100% + 1.15rem);
  left: 50%;
  width: 620px;
  padding: 1.15rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background: rgba(13, 12, 21, 0.97);
  backdrop-filter: blur(24px);
  box-shadow: ${({ theme }) => theme.shadow.lift};
  transform: translateX(-50%);
  transform-origin: top center;
  z-index: 120;

  &::before {
    content: '';
    position: absolute;
    inset: -1.15rem 0 auto;
    height: 1.15rem;
  }
`;

const IndustriesMega = styled(Mega)`
  width: 540px;
`;

const MegaTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.15rem 0.6rem 0.9rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.lineSoft};

  span:first-child {
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.faint};
  }

  span:last-child {
    font-size: 0.68rem;
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const MegaGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.2rem;
  padding: 0.65rem 0;
`;

const MegaLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem 0.6rem;
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.83rem;
  transition:
    background-color 0.25s ease,
    color 0.25s ease;

  svg {
    color: ${({ theme }) => theme.colors.faint};
    flex-shrink: 0;
    transition: color 0.25s ease;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.04);
    color: ${({ theme }) => theme.colors.text};
  }

  &:hover svg {
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const MegaFooter = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 0.6rem 0.2rem;
  margin-top: 0.25rem;
  border-top: 1px solid ${({ theme }) => theme.colors.lineSoft};
  font-size: 0.78rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSoft};

  &:hover {
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const TalkButton = styled.div`
  ${media.down('md')} {
    display: none;
  }
`;

const MenuButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background: rgba(255, 255, 255, 0.03);
  color: ${({ theme }) => theme.colors.text};
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.violetWash};
    border-color: ${({ theme }) => theme.colors.violetLine};
  }

  ${media.down('lg')} {
    display: inline-flex;
  }
`;

const Progress = styled(motion.span)`
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 1.5px;
  background: linear-gradient(90deg, #9b7dff, #4d8dff);
  transform-origin: 0 50%;
  opacity: ${({ $scrolled }) => ($scrolled ? 1 : 0)};
  transition: opacity 0.3s ease;
`;

const Overlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.overlay};
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(560px circle at 85% -10%, rgba(124, 92, 255, 0.2), transparent 65%),
    radial-gradient(480px circle at 0% 100%, rgba(77, 141, 255, 0.12), transparent 60%),
    #08080d;
  overflow-y: auto;
  overscroll-behavior: contain;
`;

const OverlayInner = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
  padding: 1rem clamp(1.25rem, 5vw, 2rem) 2rem;
`;

const OverlayTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-block: 0.35rem 1.4rem;
`;

const CloseButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  color: ${({ theme }) => theme.colors.text};

  &:hover {
    background: ${({ theme }) => theme.colors.violetWash};
    border-color: ${({ theme }) => theme.colors.violetLine};
  }
`;

const MobileNav = styled(motion.nav)`
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding-top: 0.5rem;
`;

const MobileLink = styled(Link)`
  display: flex;
  align-items: baseline;
  gap: 0.9rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.lineSoft};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: clamp(1.65rem, 6vw, 2.3rem);
  font-weight: 500;
  letter-spacing: -0.035em;
  color: ${({ theme }) => theme.colors.text};

  small {
    font-family: ${({ theme }) => theme.fonts.body};
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    color: ${({ theme }) => theme.colors.faint};
  }

  svg {
    margin-left: auto;
    color: ${({ theme }) => theme.colors.faint};
  }
`;

const MobileServices = styled.div`
  margin-top: 1.35rem;

  > p {
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.faint};
    margin-bottom: 0.65rem;
  }

  div {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.1rem 1rem;
  }

  ${media.down('xs')} {
    div {
      grid-template-columns: 1fr;
    }
  }

  a {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.42rem 0;
    font-size: 0.84rem;
    color: ${({ theme }) => theme.colors.muted};

    &:hover {
      color: ${({ theme }) => theme.colors.text};
    }

    svg {
      color: ${({ theme }) => theme.colors.faint};
    }
  }
`;

const OverlayFooter = styled.div`
  margin-top: auto;
  padding-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const OverlayContacts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;

  a {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.55rem 0.85rem;
    border: 1px solid ${({ theme }) => theme.colors.line};
    border-radius: 999px;
    font-size: 0.78rem;
    color: ${({ theme }) => theme.colors.muted};

    &:hover {
      border-color: ${({ theme }) => theme.colors.violetLine};
      color: ${({ theme }) => theme.colors.text};
    }
  }
`;

const mobileItem = {
  hidden: { opacity: 0, y: 18 },
  show: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 + i * 0.055, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [industriesOpen, setIndustriesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activePath, setActivePath] = useState(pathname);
  const serviceAreaRef = useRef(null);
  const industriesAreaRef = useRef(null);
  const overlayRef = useRef(null);
  const closeRef = useRef(null);
  const menuButtonRef = useRef(null);

  if (activePath !== pathname) {
    setActivePath(pathname);
    setServicesOpen(false);
    setIndustriesOpen(false);
    setMobileOpen(false);
  }

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!servicesOpen) return undefined;
    const onPointerDown = (event) => {
      if (serviceAreaRef.current && !serviceAreaRef.current.contains(event.target)) {
        setServicesOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setServicesOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [servicesOpen]);

  useEffect(() => {
    if (!industriesOpen) return undefined;
    const onPointerDown = (event) => {
      if (
        industriesAreaRef.current &&
        !industriesAreaRef.current.contains(event.target)
      ) {
        setIndustriesOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIndustriesOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [industriesOpen]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => closeRef.current?.focus(), 120);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [mobileOpen]);

  const closeMobile = () => {
    setMobileOpen(false);
    window.setTimeout(() => menuButtonRef.current?.focus(), 50);
  };

  const handleOverlayKeyDown = (event) => {
    if (event.key === 'Escape') {
      closeMobile();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = overlayRef.current?.querySelectorAll(
      'a[href], button:not([disabled])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const isActive = (href) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      <AnnouncementBar />
      <Wrapper $scrolled={scrolled}>
        <Inner $scrolled={scrolled}>
          <BrandLogo priority />

          <Nav aria-label="Main navigation">
            {siteConfig.nav.map((item) =>
              item.label === 'Services' ? (
                <ServiceArea
                  key={item.href}
                  ref={serviceAreaRef}
                  onMouseEnter={() => setServicesOpen(true)}
                  onMouseLeave={() => setServicesOpen(false)}
                >
                  <NavLink href={item.href} $active={isActive(item.href)}>
                    {item.label}
                  </NavLink>
                  <Chevron
                    type="button"
                    aria-label="Show services menu"
                    aria-expanded={servicesOpen}
                    aria-controls="services-mega"
                    onClick={() => setServicesOpen(true)}
                  >
                    <ChevronDown
                      size={14}
                      style={{
                        transform: servicesOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.3s ease',
                      }}
                    />
                  </Chevron>
                  <AnimatePresence>
                    {servicesOpen ? (
                      <Mega
                        id="services-mega"
                        initial={{ opacity: 0, y: 10, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.985 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <MegaTop>
                          <span>Capabilities</span>
                          <span>
                            {String(serviceCategories.length).padStart(2, '0')}{' '}
                            categories
                          </span>
                        </MegaTop>
                        <MegaGrid>
                          {serviceCategories.map((category) => (
                            <MegaLink
                              key={category.slug}
                              href={`/services#${category.slug}`}
                              onClick={() => setServicesOpen(false)}
                            >
                              <Icon name={category.icon} size={16} strokeWidth={1.6} />
                              {category.title}
                            </MegaLink>
                          ))}
                        </MegaGrid>
                        <MegaFooter href="/services">
                          View all services
                          <ArrowUpRight size={15} />
                        </MegaFooter>
                      </Mega>
                    ) : null}
                  </AnimatePresence>
                </ServiceArea>
              ) : item.label === 'Industries' ? (
                <ServiceArea
                  key={item.href}
                  ref={industriesAreaRef}
                  onMouseEnter={() => setIndustriesOpen(true)}
                  onMouseLeave={() => setIndustriesOpen(false)}
                >
                  <NavLink href={item.href} $active={isActive(item.href)}>
                    {item.label}
                  </NavLink>
                  <Chevron
                    type="button"
                    aria-label="Show industries menu"
                    aria-expanded={industriesOpen}
                    aria-controls="industries-mega"
                    onClick={() => setIndustriesOpen(true)}
                  >
                    <ChevronDown
                      size={14}
                      style={{
                        transform: industriesOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.3s ease',
                      }}
                    />
                  </Chevron>
                  <AnimatePresence>
                    {industriesOpen ? (
                      <IndustriesMega
                        id="industries-mega"
                        initial={{ opacity: 0, y: 10, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.985 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <MegaTop>
                          <span>Industries</span>
                          <span>
                            {String(industries.length).padStart(2, '0')} sectors
                          </span>
                        </MegaTop>
                        <MegaGrid>
                          {industries.map((industry) => (
                            <MegaLink
                              key={industry.slug}
                              href={`/industries#${industry.slug}`}
                              onClick={() => setIndustriesOpen(false)}
                            >
                              <Icon name={industry.icon} size={16} strokeWidth={1.6} />
                              {industry.name}
                            </MegaLink>
                          ))}
                        </MegaGrid>
                        <MegaFooter href="/industries">
                          View all industries
                          <ArrowUpRight size={15} />
                        </MegaFooter>
                      </IndustriesMega>
                    ) : null}
                  </AnimatePresence>
                </ServiceArea>
              ) : (
                <NavLink
                  key={item.href}
                  href={item.href}
                  $active={isActive(item.href)}
                >
                  {item.label}
                </NavLink>
              )
            )}
          </Nav>

          <Actions>
            <TalkButton>
              <Button href={siteConfig.cta.href} size="sm">
                {siteConfig.cta.label}
              </Button>
            </TalkButton>
            <MenuButton
              ref={menuButtonRef}
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} strokeWidth={1.8} />
            </MenuButton>
          </Actions>
        </Inner>
        <Progress $scrolled={scrolled} style={{ scaleX: progress }} />
      </Wrapper>

      <AnimatePresence>
        {mobileOpen ? (
          <Overlay
            id="mobile-menu"
            ref={overlayRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            onKeyDown={handleOverlayKeyDown}
          >
            <OverlayInner>
              <OverlayTop>
                <BrandLogo />
                <CloseButton
                  ref={closeRef}
                  type="button"
                  aria-label="Close menu"
                  onClick={closeMobile}
                >
                  <X size={20} strokeWidth={1.8} />
                </CloseButton>
              </OverlayTop>

              <MobileNav aria-label="Mobile navigation links">
                {siteConfig.nav.map((item, index) => (
                  <motion.div
                    key={item.href}
                    custom={index}
                    variants={mobileItem}
                    initial="hidden"
                    animate="show"
                  >
                    <MobileLink href={item.href} onClick={closeMobile}>
                      <small>{String(index + 1).padStart(2, '0')}</small>
                      {item.label}
                      <ArrowUpRight size={17} />
                    </MobileLink>
                  </motion.div>
                ))}
              </MobileNav>

              <MobileServices>
                <p>Service categories</p>
                <div>
                  {serviceCategories.map((category) => (
                    <Link
                      key={category.slug}
                      href={`/services#${category.slug}`}
                      onClick={closeMobile}
                    >
                      <Icon name={category.icon} size={14} strokeWidth={1.7} />
                      {category.title}
                    </Link>
                  ))}
                </div>
              </MobileServices>

              <MobileServices aria-label="Industries we serve">
                <p>Industries we serve</p>
                <div>
                  {industries.map((industry) => (
                    <Link
                      key={industry.slug}
                      href={`/industries#${industry.slug}`}
                      onClick={closeMobile}
                    >
                      <Icon name={industry.icon} size={14} strokeWidth={1.7} />
                      {industry.name}
                    </Link>
                  ))}
                </div>
              </MobileServices>

              <OverlayFooter>
                <Button href="/contact" size="lg" full onClick={closeMobile}>
                  Start Your Project
                </Button>
                <OverlayContacts>
                  <a
                    href={siteConfig.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                  <a href={`mailto:${siteConfig.email}`}>
                    <Mail size={14} /> {siteConfig.email}
                  </a>
                </OverlayContacts>
              </OverlayFooter>
            </OverlayInner>
          </Overlay>
        ) : null}
      </AnimatePresence>
    </>
  );
}
