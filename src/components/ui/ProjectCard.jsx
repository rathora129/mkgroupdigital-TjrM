'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import styled, { css } from 'styled-components';
import { media } from '@/styles/theme';

const Card = styled.article`
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.card};
  overflow: hidden;
  transition:
    transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.35s ease,
    box-shadow 0.5s ease;

  &:hover {
    transform: translateY(-5px);
    border-color: ${({ theme }) => theme.colors.violetLine};
    box-shadow: ${({ theme }) => theme.shadow.lift};
  }

  &:hover .project-media img {
    transform: scale(1.035);
  }

  &:hover .project-arrow {
    transform: translate(3px, -3px);
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const StretchedLink = styled(Link)`
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;

  &:focus-visible {
    outline: 2px solid rgba(124, 92, 255, 0.7);
    outline-offset: 3px;
  }
`;

const Media = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.bgRaised};

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 55%, rgba(7, 7, 12, 0.55) 100%);
    pointer-events: none;
  }

  img {
    object-fit: cover;
    object-position: ${({ $position }) => $position || 'top center'};
    transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  }

  ${({ $wide }) =>
    $wide &&
    css`
      ${media.up('md')} {
        aspect-ratio: 21 / 9;
      }
    `}
`;

const Status = styled.span`
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.38rem 0.7rem;
  border-radius: 999px;
  background: rgba(7, 7, 12, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(10px);
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ theme, $pending }) =>
      $pending ? theme.colors.violetSoft : theme.colors.success};
  }
`;

const Info = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  flex: 1;
  padding: 1.4rem 1.6rem 1.5rem;
`;

const Name = styled.h3`
  font-size: clamp(1.12rem, 2vw, 1.32rem);
  letter-spacing: -0.025em;
`;

const Industry = styled.span`
  display: block;
  margin-top: 0.35rem;
  font-size: 0.78rem;
  color: ${({ theme }) => theme.colors.muted};
  letter-spacing: 0.02em;
`;

const Summary = styled.p`
  font-size: 0.86rem;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.muted};
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;

  span {
    padding: 0.3rem 0.62rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.line};
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 0.7rem;
    letter-spacing: 0.01em;
  }
`;

const Bottom = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.lineSoft};
`;

const ViewProject = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
`;

const Arrow = styled.span`
  display: inline-flex;
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    color 0.3s ease;
`;

const VisitLive = styled.a`
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background: rgba(255, 255, 255, 0.04);
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.76rem;
  font-weight: 600;
  white-space: nowrap;
  transition:
    border-color 0.3s ease,
    background 0.3s ease,
    transform 0.3s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid rgba(124, 92, 255, 0.7);
    outline-offset: 2px;
  }
`;

export default function ProjectCard({ project, wide = false }) {
  return (
    <Card>
      <StretchedLink
        href={`/work/${project.slug}`}
        aria-label={`View the ${project.name} project`}
      />
      <Media
        className="project-media"
        $wide={wide}
        $position={project.slug === 'rooteco' ? 'center' : 'top center'}
      >
        <Image
          src={wide && project.imageWide ? project.imageWide : project.image}
          alt={project.imageAlt}
          fill
          sizes={
            wide
              ? '(max-width: 900px) 100vw, 1240px'
              : '(max-width: 900px) 100vw, 50vw'
          }
        />
        <Status $pending={project.status !== 'Live'}>{project.status}</Status>
      </Media>
      <Info>
        <div>
          <Name>{project.name}</Name>
          <Industry>{project.industry}</Industry>
        </div>
        <Summary>{project.summary}</Summary>
        <Tags>
          {project.services.slice(0, 3).map((service) => (
            <span key={service}>{service}</span>
          ))}
        </Tags>
        <Bottom>
          <ViewProject>
            View project
            <Arrow className="project-arrow" aria-hidden="true">
              <ArrowUpRight size={16} strokeWidth={1.9} />
            </Arrow>
          </ViewProject>
          {project.url ? (
            <VisitLive
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit Live Website
              <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
            </VisitLive>
          ) : null}
        </Bottom>
      </Info>
    </Card>
  );
}
