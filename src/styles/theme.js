const breakpoints = {
  xs: 480,
  sm: 640,
  md: 900,
  lg: 1100,
  xl: 1320,
};

export const media = {
  down: (bp) => `@media (max-width: ${breakpoints[bp] - 0.02}px)`,
  up: (bp) => `@media (min-width: ${breakpoints[bp]}px)`,
};

const theme = {
  colors: {
    bg: '#07070C',
    bgSoft: '#0A0A11',
    bgRaised: '#0E0E16',
    card: '#11111B',
    cardHover: '#161522',
    cardActive: '#1A1828',
    text: '#F4F4F7',
    textSoft: '#C9C9D4',
    muted: '#9696A8',
    faint: '#6B6B7E',
    line: 'rgba(255, 255, 255, 0.08)',
    lineSoft: 'rgba(255, 255, 255, 0.05)',
    lineStrong: 'rgba(255, 255, 255, 0.16)',
    violet: '#7C5CFF',
    violetBright: '#9B7DFF',
    violetSoft: '#C8B8FF',
    violetDeep: '#5335C9',
    violetWash: 'rgba(124, 92, 255, 0.12)',
    violetLine: 'rgba(124, 92, 255, 0.34)',
    blue: '#4D8DFF',
    blueSoft: '#9CC0FF',
    blueWash: 'rgba(77, 141, 255, 0.12)',
    success: '#57D6A4',
    successWash: 'rgba(87, 214, 164, 0.12)',
    danger: '#FF7A7A',
    dangerWash: 'rgba(255, 122, 122, 0.12)',
    white: '#FFFFFF',
    black: '#000000',
  },
  gradients: {
    accent: 'linear-gradient(120deg, #9B7DFF 0%, #7C5CFF 45%, #4D8DFF 100%)',
    text: 'linear-gradient(100deg, #FFFFFF 0%, #EFEAFF 42%, #A88CFF 78%, #7FA8FF 100%)',
    line: 'linear-gradient(90deg, transparent, rgba(124, 92, 255, 0.6), transparent)',
    card: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))',
  },
  fonts: {
    display: 'var(--font-display), "Space Grotesk", system-ui, sans-serif',
    body: 'var(--font-body), Inter, system-ui, sans-serif',
  },
  radius: {
    xs: '8px',
    sm: '12px',
    md: '18px',
    lg: '24px',
    xl: '32px',
    pill: '999px',
  },
  shadow: {
    card: '0 24px 60px -32px rgba(0, 0, 0, 0.85)',
    lift: '0 40px 90px -36px rgba(0, 0, 0, 0.95)',
    glow: '0 0 80px -12px rgba(124, 92, 255, 0.45)',
    button: '0 18px 40px -18px rgba(124, 92, 255, 0.75)',
  },
  spacing: {
    section: 'clamp(5.5rem, 10vw, 9rem)',
    sectionSm: 'clamp(4rem, 7vw, 6rem)',
    gutter: 'clamp(1.25rem, 4vw, 2.75rem)',
  },
  container: {
    base: '1240px',
    wide: '1420px',
    narrow: '880px',
    prose: '740px',
  },
  breakpoints,
  media,
  motion: {
    fast: 0.16,
    base: 0.42,
    slow: 0.8,
    ease: [0.22, 1, 0.36, 1],
    easeOut: [0.16, 1, 0.3, 1],
  },
  z: {
    base: 1,
    header: 100,
    overlay: 200,
  },
};

export { breakpoints };
export default theme;
