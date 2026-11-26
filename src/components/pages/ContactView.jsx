'use client';

import Image from 'next/image';
import {
  ArrowUpRight,
  Clock3,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from 'lucide-react';
import styled from 'styled-components';
import PageHero from '@/components/sections/PageHero';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';
import SectionHeading from '@/components/ui/SectionHeading';
import Reveal from '@/components/ui/Reveal';
import Accordion from '@/components/ui/Accordion';
import Button from '@/components/ui/Button';
import ContactForm from '@/components/contact/ContactForm';
import { faqs } from '@/data/faqs';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.6fr);
  gap: clamp(1.5rem, 4vw, 3rem);
  align-items: start;

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.div`
  padding: clamp(1.5rem, 4vw, 2.75rem);
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background:
    radial-gradient(560px circle at 0% 0%, rgba(124, 92, 255, 0.1), transparent 60%),
    ${({ theme }) => theme.colors.card};
`;

const PanelHead = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.75rem;
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

  &::before {
    content: '';
    width: 24px;
    height: 1px;
    background: ${({ theme }) => theme.gradients.accent};
  }
`;

const PanelTitle = styled.h2`
  font-size: clamp(1.6rem, 3vw, 2.15rem);
  letter-spacing: -0.035em;
`;

const PanelText = styled.p`
  max-width: 540px;
  font-size: 0.92rem;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.muted};
`;

const Rail = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  position: sticky;
  top: 130px;

  ${media.down('md')} {
    position: static;
  }
`;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1.35rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.bgSoft};
  transition:
    border-color 0.3s ease,
    background 0.3s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.violetLine};
  }
`;

const CardHead = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: ${({ theme }) => theme.colors.violetSoft};

  span {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
`;

const CardLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: clamp(1rem, 1.8vw, 1.15rem);
  font-weight: 500;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;

  &:hover {
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const CardValue = styled.p`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: clamp(1rem, 1.8vw, 1.15rem);
  font-weight: 500;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.text};
`;

const CardNote = styled.p`
  font-size: 0.76rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.faint};
`;

const Availability = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.85rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(87, 214, 164, 0.22);
  background: rgba(87, 214, 164, 0.06);
  color: ${({ theme }) => theme.colors.success};
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 0 4px rgba(87, 214, 164, 0.1);
  }
`;

const Next = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.35rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: linear-gradient(160deg, rgba(124, 92, 255, 0.09), rgba(255, 255, 255, 0.015));
`;

const Step = styled.div`
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 0.65rem;
  align-items: start;

  span {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: ${({ theme }) => theme.colors.violetSoft};
    padding-top: 0.12rem;
  }

  p {
    font-size: 0.8rem;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.textSoft};
  }
`;

const FaqWrap = styled.div`
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: clamp(2rem, 6vw, 5rem);
  align-items: start;

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const DirectLine = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;

  p {
    font-size: 0.9rem;
    line-height: 1.7;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const IgCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.9rem;
  padding: 1.5rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid rgba(214, 51, 132, 0.28);
  background:
    radial-gradient(320px circle at 100% 0%, rgba(214, 51, 132, 0.16), transparent 65%),
    radial-gradient(260px circle at 0% 100%, rgba(124, 92, 255, 0.12), transparent 60%),
    ${({ theme }) => theme.colors.bgSoft};
`;

const IgQr = styled.div`
  position: relative;
  width: min(188px, 60%);
  aspect-ratio: 2350 / 2700;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: #fff;
  box-shadow: 0 18px 40px -22px rgba(214, 51, 132, 0.55);

  img {
    object-fit: cover;
  }
`;

const IgTitle = styled.h3`
  font-size: 1.12rem;
  letter-spacing: -0.02em;
`;

const IgCopy = styled.p`
  font-size: 0.8rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.muted};
`;

const IgScan = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.violetSoft};
`;

const Unsure = styled.div`
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  align-items: center;
  gap: clamp(1.5rem, 4vw, 3rem);
  padding: clamp(1.75rem, 4vw, 3rem);
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background:
    radial-gradient(560px circle at 100% 0%, rgba(124, 92, 255, 0.14), transparent 60%),
    ${({ theme }) => theme.colors.card};

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const UnsureCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;

  h2 {
    font-size: clamp(1.5rem, 3vw, 2.1rem);
    letter-spacing: -0.035em;
  }

  p {
    max-width: 520px;
    font-size: 0.94rem;
    line-height: 1.7;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const UnsureActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-end;

  ${media.down('md')} {
    justify-content: flex-start;
  }
`;

function InstagramGlyph({ size = 18 }) {
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

const faqItems = [faqs[1], faqs[2], faqs[6]];

export default function ContactView() {
  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Contact' }]}
        eyebrow="Contact"
        title={
          <>
            Tell us what
            <br />
            you&apos;re <em>building.</em>
          </>
        }
        description="Share a little about the project and where you want it to go. We will reply with a considered response — not a sales pitch."
        aside={
          <Card>
            <Availability>Available for new projects</Availability>
            <CardLink href={`mailto:${siteConfig.email}`}>
              <Mail size={17} /> {siteConfig.email}
            </CardLink>
            <CardNote>
              {siteConfig.responseTime}. Prefer to talk? WhatsApp is usually
              quickest.
            </CardNote>
          </Card>
        }
      />

      <Section $compact id="enquiry" aria-labelledby="enquiry-heading">
        <Container>
          <Grid>
            <Reveal y={18}>
              <Panel>
                <PanelHead>
                  <Eyebrow>Project enquiry</Eyebrow>
                  <PanelTitle id="enquiry-heading">Start a conversation.</PanelTitle>
                  <PanelText>
                    Your name, mobile number and a short description are all
                    that is required — fill in the rest if you can. When you
                    submit, WhatsApp opens with every detail prepared so you can
                    send it in one tap. If you are unsure about scope or budget,
                    choose the closest option and we will work it out together.
                  </PanelText>
                </PanelHead>
                <ContactForm />
              </Panel>
            </Reveal>

            <Rail>
              <Card>
                <CardHead>
                  <Mail size={16} />
                  <span>Email</span>
                </CardHead>
                <CardLink href={`mailto:${siteConfig.email}`}>
                  {siteConfig.email} <ArrowUpRight size={14} />
                </CardLink>
                <CardNote>Briefs, documents and general enquiries.</CardNote>
              </Card>

              <Card>
                <CardHead>
                  <Mail size={16} />
                  <span>Personal email</span>
                </CardHead>
                <CardLink href={`mailto:${siteConfig.personalEmail}`}>
                  {siteConfig.personalEmail} <ArrowUpRight size={14} />
                </CardLink>
                <CardNote>
                  Prefer Gmail? This reaches the same team directly.
                </CardNote>
              </Card>

              <Card>
                <CardHead>
                  <MessageCircle size={16} />
                  <span>WhatsApp</span>
                </CardHead>
                <CardLink
                  href={siteConfig.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {siteConfig.phone} <ArrowUpRight size={14} />
                </CardLink>
                <CardNote>Usually the fastest way to reach us.</CardNote>
                <Button
                  href={siteConfig.whatsappUrl}
                  external
                  size="sm"
                  icon={<MessageCircle size={15} strokeWidth={1.8} />}
                  arrow={false}
                >
                  Chat on WhatsApp
                </Button>
              </Card>

              <Card>
                <CardHead>
                  <Phone size={16} />
                  <span>Call</span>
                </CardHead>
                <CardLink href={siteConfig.phoneHref}>{siteConfig.phone}</CardLink>
                <CardNote>Call us directly for a quick conversation.</CardNote>
              </Card>

              <IgCard>
                <IgTitle>Connect with us on Instagram</IgTitle>
                <IgQr>
                  <Image
                    src={siteConfig.social.instagramQr}
                    alt="MK Group Digital Instagram QR code — scan to open our Instagram profile"
                    fill
                    sizes="190px"
                  />
                </IgQr>
                <IgScan>
                  <InstagramGlyph size={13} /> Scan to Connect
                </IgScan>
                <IgCopy>
                  Scan the QR code to explore our Instagram and connect with MK
                  Group Digital.
                </IgCopy>
                <Button
                  href={siteConfig.social.instagram}
                  external
                  variant="secondary"
                  size="sm"
                  icon={<InstagramGlyph size={15} />}
                  arrow={false}
                  aria-label="Open MK Group Digital on Instagram"
                >
                  Open Instagram
                </Button>
              </IgCard>

              <Card>
                <CardHead>
                  <MapPin size={16} />
                  <span>Based in</span>
                </CardHead>
                <CardValue>{siteConfig.location}</CardValue>
                <CardNote>Projects run over email, WhatsApp and video calls.</CardNote>
              </Card>

              <Next>
                <CardHead>
                  <Clock3 size={16} />
                  <span>What happens next</span>
                </CardHead>
                <Step>
                  <span>01</span>
                  <p>We read your brief and look at anything you have shared.</p>
                </Step>
                <Step>
                  <span>02</span>
                  <p>
                    We reply within one business day — with questions or a
                    suggested next step.
                  </p>
                </Step>
                <Step>
                  <span>03</span>
                  <p>
                    If it is a good fit, we schedule a call and prepare a written
                    proposal.
                  </p>
                </Step>
              </Next>
            </Rail>
          </Grid>
        </Container>
      </Section>

      <Section $compact aria-labelledby="unsure-heading">
        <Container>
          <Reveal y={18}>
            <Unsure>
              <UnsureCopy>
                <Eyebrow>No brief? No problem.</Eyebrow>
                <h2 id="unsure-heading">
                  Not sure what you need? <em>Let&apos;s discuss your idea.</em>
                </h2>
                <p>
                  You do not need a domain, a registered company or a fixed
                  budget to start. Bring the idea — even a rough one — and we
                  will help you work out what the right first step looks like.
                </p>
              </UnsureCopy>
              <UnsureActions>
                <Button href="/contact#enquiry" size="lg">
                  Start the conversation
                </Button>
                <Button
                  href={siteConfig.whatsappUrl}
                  external
                  variant="secondary"
                  size="lg"
                  icon={<MessageCircle size={17} strokeWidth={1.8} />}
                  arrow={false}
                >
                  Chat on WhatsApp
                </Button>
              </UnsureActions>
            </Unsure>
          </Reveal>
        </Container>
      </Section>

      <Section $tone="soft" $divider aria-labelledby="contact-faq-heading">
        <Container>
          <FaqWrap>
            <DirectLine>
              <SectionHeading
                eyebrow="Before you write"
                title={
                  <>
                    A few quick <em>answers.</em>
                  </>
                }
                description="The things most people ask before starting a conversation."
                headingId="contact-faq-heading"
              />
              <p>
                Still unsure? Send the brief anyway. It is easier to point you in
                the right direction once we understand what you need.
              </p>
            </DirectLine>
            <Accordion items={faqItems} />
          </FaqWrap>
        </Container>
      </Section>
    </>
  );
}
