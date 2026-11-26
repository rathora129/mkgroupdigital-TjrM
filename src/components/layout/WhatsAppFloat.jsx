'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import styled from 'styled-components';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const Dock = styled.div`
  position: fixed;
  right: clamp(0.9rem, 3vw, 1.75rem);
  bottom: clamp(0.9rem, 3vw, 1.75rem);
  z-index: 150;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding-bottom: env(safe-area-inset-bottom, 0px);

  ${media.down('sm')} {
    bottom: calc(0.7rem + env(safe-area-inset-bottom, 0px));
  }
`;

const Tooltip = styled.span`
  order: -1;
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(10, 10, 17, 0.92);
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.76rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  transform: translateX(6px);
  pointer-events: none;
  backdrop-filter: blur(8px);
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;

  ${Dock}:hover &,
  ${Dock}:focus-within & {
    opacity: 1;
    transform: none;
  }

  ${media.down('sm')} {
    display: none;
  }

  @media (hover: none) {
    display: none;
  }
`;

const Float = styled(motion.a)`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(140deg, #2bde73 0%, #1fae56 100%);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 18px 42px -14px rgba(31, 174, 86, 0.65);
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease;

  &:hover {
    transform: translateY(-3px) scale(1.04);
    box-shadow: 0 24px 52px -16px rgba(31, 174, 86, 0.75);
  }

  &:focus-visible {
    outline: 2px solid #2bde73;
    outline-offset: 3px;
  }

  @media (max-width: 640px) {
    width: 48px;
    height: 48px;

    svg {
      width: 22px;
      height: 22px;
    }
  }
`;

export default function WhatsAppFloat() {
  const reduceMotion = useReducedMotion();

  return (
    <Dock>
      <Tooltip aria-hidden="true">Chat with our team</Tooltip>
      <Float
        href={siteConfig.whatsappFloatUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with our team on WhatsApp"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.6, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        whileTap={{ scale: 0.96 }}
      >
        <MessageCircle size={26} strokeWidth={1.9} aria-hidden="true" />
      </Float>
    </Dock>
  );
}
