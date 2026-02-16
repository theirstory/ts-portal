'use client';

import React from 'react';
import { Box } from '@mui/material';
import { usePathname } from 'next/navigation';
import { colors } from '@/lib/theme';

export const MainContainer = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isStoryPage = pathname.startsWith('/story/');
  return (
    <Box
      id="main-container"
      sx={{
        height: '100vh',
        bgcolor: isStoryPage ? colors.background.storyPage : colors.background.mainPage,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
      {children}
    </Box>
  );
};
