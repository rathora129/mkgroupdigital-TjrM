'use client';

import Image from 'next/image';
import styled from 'styled-components';
import { Mail, MessageCircle } from 'lucide-react';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import Button from '@/components/ui/Button';
import Reveal from '@/components/ui/Reveal';
import siteConfig from '@/data/site';
import { cta } from '@/data/home';
import { media } from '@/styles/theme';

const Panel = styled.div`
  position: relative;
  overflow: hidden;
  padding: clamp(3rem, 7vw, 5.75rem) clamp(1.5rem, 5vw, 4.5rem);
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background:
    radial-gradient(760px circle at 50% -10%, rgba(124, 92, 255, 0.26), transparent 62%),
    radial-gradient(520px circle at 100% 110%, rgba(77, 141, 255, 0.16), transparent 60%),
    ${({ theme }) => theme.colors.bgRaised};
  text-align: center;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: radial-gradient(64% 70% at 50% 30%, #000, transparent 82%);
    -webkit-mask-image: radial-gradient(64% 70% at 50% 30%, #000, transparent 82%);
    pointer-events: none;
  }
`;

const Rings = styled.div`
  position: absolute;
  top: 50%;
  right: -140px;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  border: 1px solid rgba(124, 92, 255, 0.16);
  transform: translateY(-50%);
  pointer-events: none;

  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 70px;
    border-radius: 50%;
    border: 1px dashed rgba(255, 255, 255, 0.07);
  }

  &::after {
    inset: 170px;
    border-style: solid;
    border-color: rgba(124, 92, 255, 0.2);
  }

  ${media.down('md')} {
    opacity: 0.5;
    right: -260px;
  }
`;

const Watermark = styled.div`
  position: absolute;
  left: -60px;
  bottom: -40px;
  width: 300px;
  opacity: 0.055;
  transform: rotate(-8deg);
  pointer-events: none;

  img {
    width: 100%;
    height: auto;
  }

  ${media.down('md')} {
    display: none;
  }
`;

const Content = styled(Reveal)`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.3rem;
`;

const Eyebrow = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.violetSoft};

  &::before,
  &::after {
    content: '';
    width: 22px;
    height: 1px;
    background: ${({ theme }) => theme.colors.violetLine};
  }
`;

const Title = styled.h2`
  font-size: clamp(2.2rem, 5.4vw, 4.2rem);
  line-height: 1.02;
  letter-spacing: -0.045em;
  max-width: 820px;

  em {
    font-style: normal;
    background: ${({ theme }) => theme.gradients.text};
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const Text = styled.p`
  max-width: 560px;
  font-size: clamp(0.98rem, 1.6vw, 1.08rem);
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.muted};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  padding-top: 0.65rem;
`;

const Micro = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem 1.35rem;
  padding-top: 0.9rem;

  a,
  span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.76rem;
    color: ${({ theme }) => theme.colors.faint};
  }

  a:hover {
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

export default function CtaSection({
  eyebrow = cta.eyebrow,
  title = (
    <>
      {cta.titleLead} <em>{cta.titleAccent}</em>
    </>
  ),
  description = cta.description,
  primaryLabel = cta.primaryLabel,
  primaryHref = cta.primaryHref,
  whatsappLabel = 'WhatsApp Us',
}) {
  return (
    <Section $compact id="contact-cta">
      <Container $width="wide">
        <Panel>
          <Rings aria-hidden="true" />
          <Watermark aria-hidden="true">
            <Image
              src="/brand/mk-mark-light.png"
              alt=""
              width={300}
              height={156}
              sizes="300px"
            />
          </Watermark>
          <Content>
            <Eyebrow>{eyebrow}</Eyebrow>
            <Title>{title}</Title>
            <Text>{description}</Text>
            <Actions>
              <Button href={primaryHref} size="lg">
                {primaryLabel}
              </Button>
              <Button
                href={siteConfig.whatsappUrl}
                external
                variant="secondary"
                size="lg"
                icon={<MessageCircle size={17} strokeWidth={1.8} />}
                arrow={false}
              >
                {whatsappLabel}
              </Button>
            </Actions>
            <Micro>
              <a href={`mailto:${siteConfig.email}`}>
                <Mail size={13} /> {siteConfig.email}
              </a>
              <span>{siteConfig.responseTime}</span>
            </Micro>
          </Content>
        </Panel>
      </Container>
    </Section>
  );
}
