'use client';

import React, { useRef } from 'react';
import { Box } from '@mui/material';
import { ChatPanel } from './ChatPanel';
import { SidePanel } from './SidePanel';
import { TextSelectionPopover } from './TextSelectionPopover';
import { useChatStore } from '@/app/stores/useChatStore';

export const ChatContainer = () => {
  const sidePanelMode = useChatStore((s) => s.sidePanelMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSidePanelOpen = sidePanelMode !== 'hidden';

  return (
    <Box
      ref={containerRef}
      sx={{
        display: 'flex',
        flexDirection: 'row',
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
      }}>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          transition: 'flex 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
        }}>
        <ChatPanel />
      </Box>
      <Box
        sx={{
          width: isSidePanelOpen ? { xs: '100%', md: '40%' } : '0%',
          minWidth: isSidePanelOpen ? { xs: '100%', md: 400 } : 0,
          transition: 'width 0.3s ease, min-width 0.3s ease',
          overflow: 'hidden',
          borderLeft: isSidePanelOpen ? '1px solid' : 'none',
          borderColor: 'divider',
        }}>
        {isSidePanelOpen && <SidePanel />}
      </Box>
      <TextSelectionPopover containerRef={containerRef} />
    </Box>
  );
};
