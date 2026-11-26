'use client';

import styled from 'styled-components';
import { Mail, MessageCircle } from 'lucide-react';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import Accordion from '@/components/ui/Accordion';
import Button from '@/components/ui/Button';
import { faqs } from '@/data/faqs';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const Layout = styled.div`
  display: grid;
  grid-template-columns: 0.85fr 1.15fr;
  gap: clamp(2.5rem, 6vw, 5.5rem);
  align-items: start;

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Left = styled.div`
  position: sticky;
  top: 140px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;

  ${media.down('md')} {
    position: static;
  }
`;

const Help = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.2rem 1.3rem;
  width: 100%;
  max-width: 340px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.02);
`;

const HelpTitle = styled.p`
  font-size: 0.88rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const ContactRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  a {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.muted};
    transition: color 0.25s ease;

    &:hover {
      color: ${({ theme }) => theme.colors.violetSoft};
    }

    svg {
      color: ${({ theme }) => theme.colors.faint};
    }
  }
`;

export default function FaqSection() {
  return (
    <Section $tone="soft" $divider id="faq" aria-labelledby="faq-heading">
      <Container>
        <Layout>
          <Left>
            <SectionHeading
              eyebrow="FAQ"
              title={
                <>
                  Questions, <em>answered.</em>
                </>
              }
              description="A few things worth knowing before we start. If your question is not here, ask us directly."
              headingId="faq-heading"
            />
            <Help>
              <HelpTitle>Still have a question?</HelpTitle>
              <ContactRow>
                <a href={`mailto:${siteConfig.email}`}>
                  <Mail size={14} /> {siteConfig.email}
                </a>
                <a
                  href={siteConfig.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={14} /> Chat on WhatsApp
                </a>
              </ContactRow>
              <Button href="/contact" variant="secondary" size="sm">
                Contact us
              </Button>
            </Help>
          </Left>

          <Accordion items={faqs} defaultOpen={0} />
        </Layout>
      </Container>
    </Section>
  );
}
