'use client';

import { createGlobalStyle } from 'styled-components';
import { media } from './theme';

const GlobalStyles = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
  }

  html {
    scroll-behavior: smooth;
    -webkit-text-size-adjust: 100%;
    scroll-padding-top: 120px;
  }

  body {
    margin: 0;
    min-height: 100%;
    background: ${({ theme }) => theme.colors.bg};
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.fonts.body};
    font-size: 16px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-x: clip;
  }

  #main {
    min-height: 60vh;
    position: relative;
    z-index: ${({ theme }) => theme.z.base};
  }

  h1, h2, h3, h4, h5, h6 {
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 600;
    line-height: 1.05;
    letter-spacing: -0.035em;
    color: ${({ theme }) => theme.colors.text};
    text-wrap: balance;
  }

  p {
    margin: 0;
    text-wrap: pretty;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  ul, ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  img, svg, video {
    display: block;
    max-width: 100%;
  }

  img {
    height: auto;
  }

  input, textarea, select {
    font: inherit;
    color: inherit;
  }

  ::selection {
    background: rgba(124, 92, 255, 0.45);
    color: #fff;
  }

  :focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.violetSoft};
    outline-offset: 3px;
    border-radius: 4px;
  }

  ::-webkit-scrollbar {
    width: 10px;
  }
  ::-webkit-scrollbar-track {
    background: ${({ theme }) => theme.colors.bg};
  }
  ::-webkit-scrollbar-thumb {
    background: #29243a;
    border-radius: 999px;
    border: 2px solid ${({ theme }) => theme.colors.bg};
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #3b3357;
  }

  .skip-link {
    position: fixed;
    top: -120px;
    left: 16px;
    z-index: 999;
    padding: 12px 20px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.violet};
    color: #fff;
    font-weight: 600;
    transition: top 0.2s ease;
  }
  .skip-link:focus {
    top: 16px;
  }

  .visually-hidden {
    position: absolute !important;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  .text-gradient {
    background: ${({ theme }) => theme.gradients.text};
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }

  .noise {
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    opacity: 0.032;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  ${media.down('md')} {
    html {
      scroll-padding-top: 96px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html {
      scroll-behavior: auto;
    }
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }
`;

export default GlobalStyles;
