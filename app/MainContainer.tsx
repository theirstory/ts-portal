'use client';

import React from 'react';
import { Box } from '@mui/material';
import { usePathname, useSearchParams } from 'next/navigation';
import { colors } from '@/lib/theme';

export const MainContainer = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';
  const isStoryPage = pathname.startsWith('/story/');
  const isChatPage = pathname.startsWith('/discover');
  return (
    <Box
      id="main-container"
      sx={{
        height: '100dvh',
        bgcolor: isEmbed ? 'transparent' : isStoryPage || isChatPage ? colors.background.storyPage : colors.background.mainPage,
        overflow: 'auto',
        overscrollBehaviorY: 'contain',
        display: 'flex',
        flexDirection: 'column',
      }}>
      {children}
    </Box>
  );
};
