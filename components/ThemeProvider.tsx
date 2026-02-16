'use client';

import * as React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from '@/lib/theme';

/**
 * Material UI Theme Provider
 *
 * Wraps the application with the custom MUI theme.
 * Theme configuration is defined in @/lib/theme/theme.ts
 * Color definitions are in @/lib/theme/colors.ts
 */
export default function MaterialUIThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
