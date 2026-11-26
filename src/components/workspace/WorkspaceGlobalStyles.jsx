'use client';

import { createGlobalStyle } from 'styled-components';

const WorkspaceGlobalStyles = createGlobalStyle`
  .workspace-root {
    min-height: 100dvh;
    background: #FFFFFF;
    color: #172033;
    color-scheme: light;
    font-family: var(--font-body), Inter, system-ui, -apple-system, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Headings must beat the public site's dark-theme element styles. */
  .workspace-root h1,
  .workspace-root h2,
  .workspace-root h3,
  .workspace-root h4,
  .workspace-root h5,
  .workspace-root h6 {
    margin: 0;
    font-family: var(--font-body), Inter, system-ui, sans-serif;
    color: #172033;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  .workspace-root p {
    margin: 0;
    text-wrap: pretty;
  }

  /* Links and buttons stay low-specificity so styled components can theme them. */
  :where(.workspace-root) :where(a) {
    color: inherit;
    text-decoration: none;
  }

  :where(.workspace-root) :where(button) {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .workspace-root ul,
  .workspace-root ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .workspace-root img,
  .workspace-root svg {
    display: block;
  }

  .workspace-root :focus-visible {
    outline: 2px solid #4F46E5;
    outline-offset: 2px;
    border-radius: 4px;
  }

  .workspace-root .spin {
    animation: workspace-spin 0.9s linear infinite;
  }

  @keyframes workspace-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .workspace-root ::selection {
    background: #EEF2FF;
    color: #172033;
  }

  .workspace-skip {
    position: fixed;
    top: -80px;
    left: 16px;
    z-index: 1000;
    padding: 10px 16px;
    border-radius: 8px;
    background: #4F46E5;
    color: #FFFFFF;
    font-size: 0.85rem;
    font-weight: 600;
    transition: top 0.2s ease;
  }

  .workspace-skip:focus {
    top: 14px;
  }

  body:has(.workspace-root) {
    background: #FFFFFF;
  }

  body:has(.workspace-root) ::selection {
    background: #EEF2FF;
    color: #172033;
  }

  body:has(.workspace-root)::-webkit-scrollbar-track {
    background: #F8FAFC;
  }

  body:has(.workspace-root)::-webkit-scrollbar-thumb {
    background: #CBD5E1;
    border: 2px solid #F8FAFC;
  }

  body:has(.workspace-root)::-webkit-scrollbar-thumb:hover {
    background: #94A3B8;
  }
`;

export default WorkspaceGlobalStyles;
