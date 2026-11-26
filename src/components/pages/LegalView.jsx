'use client';

import Link from 'next/link';
import { Mail, MessageCircle } from 'lucide-react';
import styled from 'styled-components';
import PageHero from '@/components/sections/PageHero';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const Layout = styled.div`
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: clamp(2rem, 6vw, 5rem);
  align-items: start;

  ${media.down('md')} {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
`;

const Toc = styled.nav`
  position: sticky;
  top: 130px;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1.25rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.bgSoft};

  h2 {
    font-family: ${({ theme }) => theme.fonts.body};
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.17em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.faint};
    margin-bottom: 0.2rem;
  }

  a {
    font-size: 0.78rem;
    line-height: 1.45;
    color: ${({ theme }) => theme.colors.muted};
    transition: color 0.25s ease;
  }

  a:hover {
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  ${media.down('md')} {
    position: static;
  }
`;

const Updated = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 2rem;
  padding: 0.42rem 0.8rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.muted};
`;

const Prose = styled.div`
  max-width: 760px;
`;

const Block = styled.section`
  padding-block: 1.75rem;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  scroll-margin-top: 130px;

  &:first-of-type {
    border-top: 0;
    padding-top: 0;
  }

  h2 {
    font-size: clamp(1.25rem, 2.4vw, 1.6rem);
    letter-spacing: -0.03em;
    margin-bottom: 0.9rem;
  }

  p {
    font-size: 0.95rem;
    line-height: 1.8;
    color: ${({ theme }) => theme.colors.muted};

    & + p {
      margin-top: 0.9rem;
    }
  }

  a {
    color: ${({ theme }) => theme.colors.violetSoft};
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 1rem 0;
    padding-left: 0;
    list-style: none;
  }

  li {
    position: relative;
    padding-left: 1.2rem;
    font-size: 0.94rem;
    line-height: 1.7;
    color: ${({ theme }) => theme.colors.muted};

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.65rem;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: ${({ theme }) => theme.colors.violet};
    }
  }
`;

const ContactCard = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.25rem;

  a {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.65rem 0.95rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.lineStrong};
    background: ${({ theme }) => theme.colors.card};
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.textSoft};
    transition:
      border-color 0.3s ease,
      color 0.3s ease,
      background 0.3s ease;
  }

  a:hover {
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
    color: ${({ theme }) => theme.colors.text};
  }
`;

export default function LegalView({ document }) {
  const words = document.title.split(' ');
  const last = words.pop();

  return (
    <>
      <PageHero
        breadcrumb={[
          { name: 'Home', path: '/' },
          { name: document.title },
        ]}
        eyebrow="Legal"
        title={
          <>
            {words.join(' ')} <em>{last}.</em>
          </>
        }
        description={document.intro}
        narrow
      />

      <Section $compact>
        <Container>
          <Layout>
            <Toc aria-label={`${document.title} contents`}>
              <h2>On this page</h2>
              {document.sections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.title}
                </a>
              ))}
            </Toc>

            <Prose>
              <Updated>Last updated: {document.updated}</Updated>
              {document.sections.map((section) => (
                <Block key={section.id} id={section.id}>
                  <h2>{section.title}</h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                  ))}
                  {section.list ? (
                    <ul>
                      {section.list.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.after
                    ? section.after.map((paragraph) => (
                        <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                      ))
                    : null}
                  {section.id === 'privacy' ? (
                    <p>
                      <Link href="/privacy-policy">Read the full Privacy Policy</Link>.
                    </p>
                  ) : null}
                  {section.id === 'contact' ? (
                    <ContactCard>
                      <a href={`mailto:${siteConfig.email}`}>
                        <Mail size={14} /> {siteConfig.email}
                      </a>
                      <a
                        href={siteConfig.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle size={14} /> WhatsApp
                      </a>
                    </ContactCard>
                  ) : null}
                </Block>
              ))}
            </Prose>
          </Layout>
        </Container>
      </Section>
    </>
  );
}
