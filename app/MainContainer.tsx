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
        height: '100dvh',
        bgcolor: isStoryPage ? colors.background.storyPage : colors.background.mainPage,
        overflow: 'auto',
        overscrollBehaviorY: 'contain',
        display: 'flex',
        flexDirection: 'column',
      }}>
      {children}
    </Box>
  );
};
