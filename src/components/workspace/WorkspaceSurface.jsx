'use client';

import styled, { ThemeProvider } from 'styled-components';
import workspaceTheme from '@/styles/workspaceTheme';
import WorkspaceGlobalStyles from './WorkspaceGlobalStyles';

const Surface = styled.div`
  min-height: 100dvh;
  background: ${({ theme }) => theme.colors.surface};
  padding: clamp(20px, 4vw, 40px);
  display: ${({ $centered }) => ($centered ? 'grid' : 'block')};
  place-items: ${({ $centered }) => ($centered ? 'center' : 'stretch')};
`;

export default function WorkspaceSurface({ children, centered = false }) {
  return (
    <ThemeProvider theme={workspaceTheme}>
      <WorkspaceGlobalStyles />
      <Surface className="workspace-root" $centered={centered}>
        {children}
      </Surface>
    </ThemeProvider>
  );
}
