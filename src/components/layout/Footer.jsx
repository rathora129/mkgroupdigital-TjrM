'use client';

import Link from 'next/link';
import {
  ArrowUp,
  ArrowUpRight,
  Mail,
  MapPin,
  MessageCircle,
} from 'lucide-react';
import styled from 'styled-components';
import BrandLogo from '@/components/ui/BrandLogo';
import { serviceCategories } from '@/data/services';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const FooterEl = styled.footer`
  position: relative;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  background:
    radial-gradient(720px circle at 12% 0%, rgba(124, 92, 255, 0.08), transparent 60%),
    ${({ theme }) => theme.colors.bgSoft};
  overflow: hidden;
`;

const Inner = styled.div`
  width: 100%;
  max-width: 1420px;
  margin-inline: auto;
  padding: clamp(3.5rem, 7vw, 5.5rem) clamp(1.25rem, 4vw, 2.75rem) 1.75rem;
`;

const Top = styled.div`
  display: grid;
  grid-template-columns: 1.25fr 1.5fr;
  gap: clamp(2.5rem, 6vw, 6rem);

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Brand = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.25rem;
  max-width: 380px;
`;

const Description = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.92rem;
  line-height: 1.75;
`;

const Availability = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.42rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(87, 214, 164, 0.22);
  background: rgba(87, 214, 164, 0.07);
  color: ${({ theme }) => theme.colors.success};
  font-size: 0.69rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 0 4px rgba(87, 214, 164, 0.12);
  }
`;

const Social = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.78rem;
  transition:
    border-color 0.3s ease,
    background-color 0.3s ease,
    color 0.3s ease;

  small {
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.faint};
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Cols = styled.div`
  display: grid;
  grid-template-columns: 0.75fr 1.35fr 1.05fr;
  gap: 2rem;

  ${media.down('sm')} {
    grid-template-columns: 1fr 1fr;
    gap: 2rem 1.5rem;
  }
`;

const Col = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.7rem;

  &:last-child {
    ${media.down('sm')} {
      grid-column: span 2;
    }
  }
`;

const ColTitle = styled.h4`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.faint};
  margin-bottom: 0.35rem;
`;

const FooterLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.85rem;
  color: ${({ theme }) => theme.colors.textSoft};
  transition: color 0.25s ease;

  svg {
    color: ${({ theme }) => theme.colors.faint};
    flex-shrink: 0;
    transition: color 0.25s ease;
  }

  &:hover {
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  &:hover svg {
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const ExternalLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.85rem;
  color: ${({ theme }) => theme.colors.textSoft};
  transition: color 0.25s ease;

  svg {
    color: ${({ theme }) => theme.colors.faint};
    flex-shrink: 0;
  }

  &:hover {
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const Muted = styled.span`
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.faint};
  line-height: 1.6;
`;

function InstagramGlyph({ size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const Wordmark = styled.p`
  margin-top: clamp(3rem, 6vw, 4.5rem);
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: clamp(2.6rem, 10.4vw, 9rem);
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 0.82;
  white-space: nowrap;
  color: transparent;
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.075);
  user-select: none;
  pointer-events: none;
`;

const Bottom = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  flex-wrap: wrap;
  margin-top: 2.25rem;
  padding-top: 1.5rem;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const Legal = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;

  a,
  span {
    font-size: 0.74rem;
    color: ${({ theme }) => theme.colors.faint};
  }

  a:hover {
    color: ${({ theme }) => theme.colors.textSoft};
  }
`;

const TopLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};

  svg {
    transition: transform 0.3s ease;
  }

  &:hover {
    color: ${({ theme }) => theme.colors.text};

    svg {
      transform: translateY(-3px);
    }
  }
`;

export default function Footer() {
  return (
    <FooterEl>
      <Inner>
        <Top>
          <Brand>
            <BrandLogo size="lg" />
            <Description>
              A full-service IT, software development and digital solutions
              company building websites, applications and growth systems for
              startups, small businesses and enterprises in India and worldwide.
            </Description>
            <Availability>{siteConfig.availability}</Availability>
            <Social
              href={siteConfig.social.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram — profile link coming soon"
            >
              <InstagramGlyph size={15} />
              Instagram
              <small>Coming soon</small>
            </Social>
          </Brand>

          <Cols>
            <Col>
              <ColTitle>Company</ColTitle>
              <FooterLink href="/">Home</FooterLink>
              <FooterLink href="/about">About Us</FooterLink>
              <FooterLink href="/services">Services</FooterLink>
              <FooterLink href="/industries">Industries</FooterLink>
              <FooterLink href="/work">Our Work</FooterLink>
              <FooterLink href="/pricing">Pricing</FooterLink>
              <FooterLink href="/contact">Contact Us</FooterLink>
            </Col>

            <Col>
              <ColTitle>Services</ColTitle>
              {serviceCategories.map((category) => (
                <FooterLink
                  key={category.slug}
                  href={`/services#${category.slug}`}
                >
                  {category.title}
                </FooterLink>
              ))}
              <FooterLink href="/services">
                All services <ArrowUpRight size={13} />
              </FooterLink>
            </Col>

            <Col>
              <ColTitle>Get in touch</ColTitle>
              <ExternalLink href={`mailto:${siteConfig.email}`}>
                <Mail size={14} />
                {siteConfig.email}
              </ExternalLink>
              <ExternalLink
                href={siteConfig.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={14} />
                {siteConfig.phone}
              </ExternalLink>
              <Muted as="span" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                <MapPin size={14} />
                {siteConfig.location}
              </Muted>
              <Muted>{siteConfig.responseTime}.</Muted>
            </Col>
          </Cols>
        </Top>

        <Wordmark aria-hidden="true">MK GROUP DIGITAL</Wordmark>

        <Bottom>
          <Legal>
            <span>
              © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
            </span>
            <Link href="/privacy-policy">Privacy Policy</Link>
            <Link href="/terms">Terms &amp; Conditions</Link>
          </Legal>
          <TopLink href="#top">
            Back to top <ArrowUp size={14} />
          </TopLink>
        </Bottom>
      </Inner>
    </FooterEl>
  );
}
