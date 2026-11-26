'use client';

import Link from 'next/link';
import { ArrowLeft, CircleDot, Clock3 } from 'lucide-react';
import styled from 'styled-components';
import { workspaceMedia } from '@/styles/workspaceTheme';
import { workspaceSections } from '@/data/workspace';

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1040px;
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  gap: 14px;
`;

const IconChip = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.primaryBorder};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
`;

const HeadCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const Eyebrow = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.warning};
`;

const Title = styled.h1`
  font-size: clamp(1.5rem, 3vw, 1.9rem);
  letter-spacing: -0.025em;
`;

const Description = styled.p`
  max-width: 640px;
  font-size: 0.88rem;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.muted};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr);
  gap: 20px;
  align-items: start;

  ${workspaceMedia.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.section`
  padding: 20px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const CardTitle = styled.h2`
  font-size: 0.9rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const CardText = styled.p`
  margin-top: 6px;
  font-size: 0.8rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.muted};
`;

const FeatureList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;

  li {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    font-size: 0.84rem;
    color: ${({ theme }) => theme.colors.textSoft};
  }

  svg {
    flex-shrink: 0;
    margin-top: 3px;
    color: ${({ theme }) => theme.colors.faint};
  }
`;

const StatusRows = styled.dl`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;

  div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }

  div:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  dt {
    font-size: 0.76rem;
    color: ${({ theme }) => theme.colors.muted};
  }

  dd {
    margin: 0;
    font-size: 0.76rem;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text};
    text-align: right;
  }
`;

const PlaceholderNote = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  font-size: 0.78rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.muted};

  svg {
    flex-shrink: 0;
    margin-top: 2px;
    color: ${({ theme }) => theme.colors.warning};
  }
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.primary};

  &:hover {
    color: ${({ theme }) => theme.colors.primaryHover};
  }
`;

export default function WorkspacePlaceholder({ sectionKey }) {
  const section = workspaceSections[sectionKey];
  if (!section) return null;

  const Icon = section.icon;

  return (
    <Page>
      <Header>
        <IconChip>
          <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
        </IconChip>
        <HeadCopy>
          <Eyebrow>Phase 1 · Placeholder</Eyebrow>
          <Title>{section.label}</Title>
          <Description>{section.description}</Description>
        </HeadCopy>
      </Header>

      <Grid>
        <Card aria-labelledby="planned-capabilities">
          <CardTitle id="planned-capabilities">Planned capabilities</CardTitle>
          <CardText>
            Listed for planning only. None of these capabilities are implemented
            or connected in Phase 1.
          </CardText>
          <FeatureList>
            {section.features.map((feature) => (
              <li key={feature}>
                <CircleDot size={14} aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          </FeatureList>
          <PlaceholderNote>
            <Clock3 size={15} aria-hidden="true" />
            <span>
              This page exists so the navigation and layout can be reviewed now.
              It does not create, store or display any records.
            </span>
          </PlaceholderNote>
        </Card>

        <Card aria-labelledby="section-status">
          <CardTitle id="section-status">Section status</CardTitle>
          <StatusRows>
            <div>
              <dt>Availability</dt>
              <dd>Placeholder</dd>
            </div>
            <div>
              <dt>Data source</dt>
              <dd>Not connected</dd>
            </div>
            <div>
              <dt>AI agents</dt>
              <dd>Not configured</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>{section.href}</dd>
            </div>
            <div>
              <dt>Planned</dt>
              <dd>Later phase</dd>
            </div>
          </StatusRows>
        </Card>
      </Grid>

      <BackLink href="/workspace">
        <ArrowLeft size={15} aria-hidden="true" />
        Back to overview
      </BackLink>
    </Page>
  );
}
