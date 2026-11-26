'use client';

import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import styled from 'styled-components';

const List = styled.div`
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const Item = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Trigger = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  width: 100%;
  padding: 1.55rem 0.25rem;
  text-align: left;
  color: ${({ theme }) => theme.colors.text};

  @media (hover: hover) {
    &:hover {
      color: ${({ theme }) => theme.colors.violetSoft};
    }
  }
`;

const Question = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: clamp(1.02rem, 2vw, 1.18rem);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.35;
`;

const Indicator = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  color: ${({ theme }) => theme.colors.textSoft};
  transition:
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.3s ease,
    border-color 0.3s ease,
    color 0.3s ease;

  ${({ $open, theme }) =>
    $open &&
    `
      transform: rotate(45deg);
      background: ${theme.colors.violetWash};
      border-color: ${theme.colors.violetLine};
      color: ${theme.colors.violetSoft};
    `}
`;

const Panel = styled(motion.div)`
  overflow: hidden;
`;

const Answer = styled.p`
  max-width: 760px;
  padding: 0 3.5rem 1.7rem 0.25rem;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.98rem;
  line-height: 1.75;

  @media (max-width: 640px) {
    padding-right: 1rem;
  }
`;

export default function Accordion({ items, defaultOpen = -1 }) {
  const [openIndex, setOpenIndex] = useState(defaultOpen);
  const baseId = useId();

  return (
    <List>
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const triggerId = `${baseId}-trigger-${index}`;
        const panelId = `${baseId}-panel-${index}`;

        return (
          <Item key={item.question}>
            <h3>
              <Trigger
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? -1 : index)}
              >
                <Question>{item.question}</Question>
                <Indicator $open={isOpen} aria-hidden="true">
                  <Plus size={18} strokeWidth={1.8} />
                </Indicator>
              </Trigger>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <Panel
                  key="panel"
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Answer>{item.answer}</Answer>
                </Panel>
              ) : null}
            </AnimatePresence>
          </Item>
        );
      })}
    </List>
  );
}
