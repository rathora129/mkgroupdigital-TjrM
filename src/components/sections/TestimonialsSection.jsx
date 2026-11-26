'use client';

import styled from 'styled-components';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import Testimonials from '@/components/ui/Testimonials';
import { testimonialCopy, testimonials } from '@/data/testimonials';

const Head = styled.div`
  margin-bottom: clamp(2rem, 4vw, 2.75rem);
`;

export default function TestimonialsSection() {
  return (
    <Section id="testimonials" aria-labelledby="testimonials-heading">
      <Container>
        <Head>
          <SectionHeading
            eyebrow={testimonialCopy.eyebrow}
            title={
              <>
                Client stories <em>coming soon.</em>
              </>
            }
            description={testimonialCopy.description}
            headingId="testimonials-heading"
          />
        </Head>
        <Testimonials items={testimonials} />
      </Container>
    </Section>
  );
}
