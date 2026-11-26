'use client';

import { ThemeProvider } from 'styled-components';
import { MotionConfig } from 'framer-motion';
import theme from '@/styles/theme';
import GlobalStyles from '@/styles/GlobalStyles';

export default function Providers({ children }) {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeProvider>
  );
}
