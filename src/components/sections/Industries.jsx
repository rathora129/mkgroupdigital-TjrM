'use client';

import styled from 'styled-components';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import Icon from '@/components/ui/Icon';
import Reveal from '@/components/ui/Reveal';
import { industries } from '@/data/industries';
import { media } from '@/styles/theme';

const Layout = styled.div`
  display: grid;
  grid-template-columns: 0.75fr 1.25fr;
  gap: clamp(2.5rem, 6vw, 5.5rem);
  align-items: start;

  ${media.down('md')} {
    grid-template-columns: 1fr;
    gap: 2.5rem;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;

  ${media.down('xs')} {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.3rem 1.25rem;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.018);
  transition:
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.3s ease,
    background-color 0.3s ease;

  &:hover {
    transform: translateY(-3px);
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
  }

  &:hover .industry-icon {
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const Top = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
`;

const IndustryIcon = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.textSoft};
  transition: color 0.3s ease;
`;

const Index = styled.span`
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  color: ${({ theme }) => theme.colors.faint};
`;

const Name = styled.h3`
  font-size: 0.98rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.3;
`;

const Line = styled.p`
  font-size: 0.78rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.muted};
`;

export default function Industries() {
  return (
    <Section $tone="soft" $divider id="industries" aria-labelledby="industries-heading">
      <Container>
        <Layout>
          <div>
            <SectionHeading
              eyebrow="Industries"
              title={
                <>
                  Built for ambitious <em>businesses.</em>
                </>
              }
              description="Different industries, one standard: work that understands the customer, the market and the commercial reality."
              headingId="industries-heading"
            />
          </div>

          <Grid>
            {industries.map((industry, index) => (
              <Reveal key={industry.name} delay={(index % 2) * 0.06} y={16}>
                <Card>
                  <Top>
                    <IndustryIcon className="industry-icon">
                      <Icon name={industry.icon} size={20} />
                    </IndustryIcon>
                    <Index>{String(index + 1).padStart(2, '0')}</Index>
                  </Top>
                  <Name>{industry.name}</Name>
                  <Line>{industry.line}</Line>
                </Card>
              </Reveal>
            ))}
          </Grid>
        </Layout>
      </Container>
    </Section>
  );
}
