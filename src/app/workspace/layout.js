export const metadata = {
  title: {
    default: 'MK AI Workforce',
    template: '%s | MK AI Workforce',
  },
  description:
    'MK AI Workforce — the AI-powered business operations workspace for MK Group Digital.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFFFF',
  colorScheme: 'light',
};

export default function WorkspaceLayout({ children }) {
  return children;
}
