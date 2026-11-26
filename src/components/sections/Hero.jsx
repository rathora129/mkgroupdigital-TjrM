'use client';

import Image from 'next/image';
import { useRef } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import { Compass, Gauge, MessageCircle, MousePointerClick, Sparkles } from 'lucide-react';
import styled from 'styled-components';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import siteConfig from '@/data/site';
import { hero } from '@/data/home';
import { processSteps } from '@/data/content';
import { media } from '@/styles/theme';

const Section = styled.section`
  position: relative;
  padding-block: clamp(2.5rem, 6vw, 4.5rem) clamp(4.5rem, 8vw, 7.5rem);
  overflow: clip;
`;

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(820px circle at 82% 12%, rgba(124, 92, 255, 0.16), transparent 62%),
    radial-gradient(680px circle at 8% 92%, rgba(77, 141, 255, 0.1), transparent 65%);
`;

const Grid = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.028) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.028) 1px, transparent 1px);
  background-size: 76px 76px;
  mask-image: radial-gradient(72% 62% at 52% 28%, #000 10%, transparent 82%);
  -webkit-mask-image: radial-gradient(72% 62% at 52% 28%, #000 10%, transparent 82%);
`;

const Inner = styled(Container)`
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1.06fr 0.94fr;
  align-items: center;
  gap: clamp(2.5rem, 5vw, 5rem);

  ${media.down('lg')} {
    grid-template-columns: 1fr;
  }
`;

const Copy = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;
`;

const Status = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.46rem 0.9rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background: rgba(255, 255, 255, 0.025);
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.success};
    box-shadow: 0 0 0 4px rgba(87, 214, 164, 0.12);
  }
`;

const Title = styled.h1`
  font-size: clamp(2.55rem, 4.7vw, 4.5rem);
  font-weight: 600;
  letter-spacing: -0.045em;
  line-height: 0.98;
  text-transform: uppercase;
  max-width: 760px;

  .line {
    display: block;
    padding-bottom: 0.04em;
  }

  .accent {
    background: ${({ theme }) => theme.gradients.text};
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    background-size: 180% 100%;
    animation: shimmer 9s ease-in-out infinite;
  }

  @keyframes shimmer {
    0%,
    100% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
  }

  ${media.down('sm')} {
    font-size: clamp(2.2rem, 9.6vw, 3rem);
  }
`;

const Lead = styled.p`
  max-width: 540px;
  font-size: clamp(0.98rem, 1.6vw, 1.08rem);
  line-height: 1.72;
  color: ${({ theme }) => theme.colors.muted};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-top: 0.4rem;
`;

const Meta = styled.ul`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem 1.35rem;
  padding-top: 1.25rem;
  border-top: 1px solid ${({ theme }) => theme.colors.line};

  li {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.76rem;
    color: ${({ theme }) => theme.colors.faint};

    svg {
      color: ${({ theme }) => theme.colors.violetSoft};
    }
  }
`;

/* ---------- Visual ---------- */

const Visual = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 520px;
  --mx: 50%;
  --my: 40%;

  ${media.down('lg')} {
    min-height: auto;
    margin-top: 1rem;
  }
`;

const VisualGlow = styled.div`
  position: absolute;
  inset: 6% 2% 8% 8%;
  background: radial-gradient(circle at 58% 45%, rgba(124, 92, 255, 0.28), transparent 62%);
  filter: blur(50px);
  pointer-events: none;
`;

const Panel = styled(motion.div)`
  position: relative;
  width: min(100%, 540px);
  border-radius: 30px;
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background:
    linear-gradient(165deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.012)),
    rgba(13, 12, 21, 0.82);
  backdrop-filter: blur(16px);
  box-shadow:
    0 50px 100px -50px rgba(0, 0, 0, 0.95),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  overflow: hidden;
  transform-style: preserve-3d;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(
      420px circle at var(--mx) var(--my),
      rgba(124, 92, 255, 0.14),
      transparent 60%
    );
    opacity: 0.9;
    pointer-events: none;
    transition: background 0.15s linear;
  }
`;

const PanelTop = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.lineSoft};
`;

const Dots = styled.span`
  display: inline-flex;
  gap: 5px;

  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
  }

  i:first-child {
    background: rgba(124, 92, 255, 0.7);
  }
`;

const PanelTitle = styled.span`
  font-size: 0.61rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: ${({ theme }) => theme.colors.faint};
`;

const Live = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: ${({ theme }) => theme.colors.success};

  &::before {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    animation: blink 2.4s ease-in-out infinite;
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
`;

const Orbit = styled.div`
  position: relative;
  z-index: 1;
  aspect-ratio: 1 / 0.92;
  min-height: 330px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Ring = styled.div`
  position: absolute;
  width: ${({ $size }) => $size}%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1px ${({ $dashed }) => ($dashed ? 'dashed' : 'solid')}
    rgba(255, 255, 255, ${({ $alpha }) => $alpha || 0.07});
  animation: ${({ $spin }) => ($spin ? 'spin 70s linear infinite' : 'none')};

  &::after {
    content: '';
    position: absolute;
    top: ${({ $dot }) => $dot?.top || 'auto'};
    left: ${({ $dot }) => $dot?.left || 'auto'};
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.violet};
    box-shadow: 0 0 16px rgba(124, 92, 255, 0.9);
    opacity: ${({ $dot }) => ($dot ? 1 : 0)};
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const Core = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 132px;
  height: 132px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 30%, rgba(155, 125, 255, 0.4), transparent 65%),
    rgba(13, 12, 21, 0.9);
  border: 1px solid ${({ theme }) => theme.colors.violetLine};
  box-shadow:
    0 0 70px -10px rgba(124, 92, 255, 0.65),
    inset 0 0 30px rgba(124, 92, 255, 0.14);

  img {
    width: 74px;
    height: auto;
  }
`;

const OrbitTag = styled.span`
  position: absolute;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.34rem 0.65rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(7, 7, 12, 0.78);
  backdrop-filter: blur(8px);
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.64rem;
  font-weight: 500;
  letter-spacing: 0.03em;
  white-space: nowrap;
  animation: float 7s ease-in-out infinite;
  animation-delay: ${({ $delay }) => $delay || '0s'};

  i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.violetSoft};
  }

  @keyframes float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-7px);
    }
  }
`;

const TagOne = styled(OrbitTag)`
  top: 12%;
  left: 50%;
  translate: -50% 0;
`;

const TagTwo = styled(OrbitTag)`
  top: 50%;
  right: 4%;
`;

const TagThree = styled(OrbitTag)`
  bottom: 12%;
  left: 50%;
  translate: -50% 0;
`;

const TagFour = styled(OrbitTag)`
  top: 50%;
  left: 4%;
`;

const Bars = styled.div`
  position: absolute;
  right: 8%;
  bottom: 7%;
  z-index: 0;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 92px;
  opacity: 0.55;

  i {
    display: block;
    width: 9px;
    border-radius: 4px 4px 2px 2px;
    background: linear-gradient(180deg, rgba(155, 125, 255, 0.9), rgba(77, 141, 255, 0.15));
    transform-origin: bottom;
    animation: rise 6s ease-in-out infinite;
  }

  i:nth-child(1) {
    height: 26%;
    animation-delay: 0s;
  }
  i:nth-child(2) {
    height: 40%;
    animation-delay: 0.25s;
  }
  i:nth-child(3) {
    height: 55%;
    animation-delay: 0.5s;
  }
  i:nth-child(4) {
    height: 74%;
    animation-delay: 0.75s;
  }
  i:nth-child(5) {
    height: 92%;
    animation-delay: 1s;
  }

  @keyframes rise {
    0%,
    100% {
      transform: scaleY(0.82);
      opacity: 0.65;
    }
    50% {
      transform: scaleY(1);
      opacity: 1;
    }
  }
`;

const PanelBottom = styled.div`
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.3rem;
  padding: 1rem 1.25rem 1.2rem;
  border-top: 1px solid ${({ theme }) => theme.colors.lineSoft};

  div {
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
  }

  small {
    font-size: 0.54rem;
    letter-spacing: 0.12em;
    color: ${({ theme }) => theme.colors.faint};
  }

  b {
    font-size: 0.6rem;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: ${({ theme }) => theme.colors.textSoft};
    line-height: 1.3;
  }
`;

const FloatCard = styled.div`
  position: absolute;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 0.9rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background: rgba(13, 12, 21, 0.9);
  backdrop-filter: blur(14px);
  box-shadow: ${({ theme }) => theme.shadow.card};
  pointer-events: none;

  ${({ $bottom }) =>
    $bottom
      ? 'right: -14px; bottom: 13%;'
      : 'left: -18px; top: 14%;'}

  span.icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  div {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }

  b {
    font-size: 0.72rem;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text};
    white-space: nowrap;
  }

  small {
    font-size: 0.62rem;
    color: ${({ theme }) => theme.colors.muted};
    white-space: nowrap;
  }

  ${media.down('lg')} {
    display: none;
  }
`;

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function Hero() {
  const reduceMotion = useReducedMotion();
  const visualRef = useRef(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 90, damping: 18 });
  const springY = useSpring(rotateY, { stiffness: 90, damping: 18 });

  const handlePointerMove = (event) => {
    if (reduceMotion || !visualRef.current) return;
    const rect = visualRef.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * 9);
    rotateX.set(-(py - 0.5) * 9);
    visualRef.current.style.setProperty('--mx', `${px * 100}%`);
    visualRef.current.style.setProperty('--my', `${py * 100}%`);
  };

  const handlePointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <Section id="hero">
      <Backdrop />
      <Grid />
      <Inner>
        <Copy variants={container} initial="hidden" animate="show">
          <motion.div variants={item}>
            <Status>{hero.status}</Status>
          </motion.div>

          <Title as={motion.h1} variants={item}>
            {hero.titleLines.map((line) => (
              <span className="line" key={line}>
                {line}
              </span>
            ))}
            <span className="line">
              <span className="accent">{hero.titleAccent}</span>
            </span>
          </Title>

          <motion.div variants={item}>
            <Lead>{hero.description}</Lead>
          </motion.div>

          <motion.div variants={item} style={{ width: '100%' }}>
            <Actions>
              <Button href={hero.primaryCta.href} size="lg">
                {hero.primaryCta.label}
              </Button>
              <Button href={hero.secondaryCta.href} variant="secondary" size="lg">
                {hero.secondaryCta.label}
              </Button>
              <Button
                href={siteConfig.whatsappUrl}
                external
                variant="ghost"
                size="lg"
                icon={<MessageCircle size={17} strokeWidth={1.8} />}
                arrow={false}
              >
                WhatsApp Us
              </Button>
            </Actions>
          </motion.div>

          <motion.div variants={item} style={{ width: '100%', maxWidth: 540 }}>
            <Meta>
              <li>
                <Compass size={14} strokeWidth={1.8} /> {hero.meta[0]}
              </li>
              <li>
                <Sparkles size={14} strokeWidth={1.8} /> {hero.meta[1]}
              </li>
              <li>
                <Gauge size={14} strokeWidth={1.8} /> {hero.meta[2]}
              </li>
            </Meta>
          </motion.div>
        </Copy>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <Visual
            ref={visualRef}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            <VisualGlow />
            <Panel
              style={
                reduceMotion
                  ? undefined
                  : {
                      rotateX: springX,
                      rotateY: springY,
                      transformPerspective: 1200,
                    }
              }
            >
              <PanelTop>
                <Dots aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </Dots>
                <PanelTitle>Growth system</PanelTitle>
                <Live>Active</Live>
              </PanelTop>

              <Orbit>
                <Ring $size={92} $alpha={0.05} />
                <Ring $size={72} $alpha={0.09} $spin $dot={{ top: '18%', left: '4%' }} />
                <Ring $size={52} $alpha={0.12} $dashed />
                <Bars aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </Bars>
                <Core>
                  <Image
                    src="/brand/mk-mark-light.png"
                    alt="MK Group Digital mark"
                    width={150}
                    height={78}
                    sizes="80px"
                    priority
                  />
                </Core>
                <TagOne $delay="0s">
                  <i /> Strategy
                </TagOne>
                <TagTwo $delay="0.6s">
                  <i /> Design
                </TagTwo>
                <TagThree $delay="1.2s">
                  <i /> Build
                </TagThree>
                <TagFour $delay="1.8s">
                  <i /> Grow
                </TagFour>
              </Orbit>

              <PanelBottom>
                {processSteps.map((step) => (
                  <div key={step.number}>
                    <small>{step.number}</small>
                    <b>{step.title}</b>
                  </div>
                ))}
              </PanelBottom>
            </Panel>

            <FloatCard>
              <span className="icon">
                <Gauge size={17} strokeWidth={1.7} />
              </span>
              <div>
                <b>Performance-first</b>
                <small>Built to load fast</small>
              </div>
            </FloatCard>

            <FloatCard $bottom>
              <span className="icon">
                <MousePointerClick size={17} strokeWidth={1.7} />
              </span>
              <div>
                <b>Conversion-minded</b>
                <small>Every click has a next step</small>
              </div>
            </FloatCard>
          </Visual>
        </motion.div>
      </Inner>
    </Section>
  );
}
