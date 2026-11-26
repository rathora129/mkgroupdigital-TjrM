const workspaceBreakpoints = {
  xs: 480,
  sm: 640,
  md: 900,
  lg: 1180,
};

export const workspaceMedia = {
  down: (bp) => `@media (max-width: ${workspaceBreakpoints[bp] - 0.02}px)`,
  up: (bp) => `@media (min-width: ${workspaceBreakpoints[bp]}px)`,
};

const workspaceTheme = {
  colors: {
    bg: '#FFFFFF',
    surface: '#F8FAFC',
    surfaceRaised: '#FFFFFF',
    surfaceMuted: '#F1F5F9',
    text: '#172033',
    textSoft: '#334155',
    muted: '#64748B',
    faint: '#94A3B8',
    border: '#E5EAF1',
    borderStrong: '#CBD5E1',
    primary: '#4F46E5',
    primaryHover: '#4338CA',
    primarySoft: '#EEF2FF',
    primaryBorder: '#C7D2FE',
    success: '#15803D',
    successSoft: '#F0FDF4',
    warning: '#B45309',
    warningSoft: '#FFFBEB',
    danger: '#B91C1C',
    dangerSoft: '#FEF2F2',
  },
  fonts: {
    body: 'var(--font-body), Inter, system-ui, -apple-system, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  radius: {
    sm: '8px',
    md: '10px',
    lg: '14px',
    xl: '18px',
  },
  shadow: {
    card: '0 1px 2px rgba(23, 32, 51, 0.04)',
    raised: '0 18px 40px -28px rgba(23, 32, 51, 0.35)',
  },
  sidebarWidth: '256px',
  topbarHeight: '64px',
};

export default workspaceTheme;
