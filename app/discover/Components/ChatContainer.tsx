'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { ChatPanel } from './ChatPanel';
import { SidePanel } from './SidePanel';
import { TextSelectionPopover } from './TextSelectionPopover';
import { ChatContextProvider } from '@/app/discover/ChatContext';
import { useChatStore } from '@/app/stores/useChatStore';
import { Citation } from '@/types/chat';

export const ChatContainer = () => {
  const sidePanelMode = useChatStore((s) => s.sidePanelMode);
  const messages = useChatStore((s) => s.messages);
  const showSourcesForMessage = useChatStore((s) => s.showSourcesForMessage);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSidePanelOpen = sidePanelMode !== 'hidden';

  // Auto-open sources panel when page loads with existing chat context
  useEffect(() => {
    if (messages.length >= 2 && sidePanelMode === 'hidden') {
      // Find the last assistant message with citations
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'assistant' && msg.citations && msg.citations.length > 0) {
          showSourcesForMessage(msg.id);
          break;
        }
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleViewSources = useCallback(
    (citations: Citation[]) => {
      // Find the assistant message that has these citations
      for (const msg of messages) {
        if (msg.role === 'assistant' && msg.citations === citations) {
          showSourcesForMessage(msg.id);
          return;
        }
      }
      // Fallback: find by matching first citation
      if (citations.length > 0) {
        for (const msg of messages) {
          if (
            msg.role === 'assistant' &&
            msg.citations &&
            msg.citations.length > 0 &&
            msg.citations[0].index === citations[0].index &&
            msg.citations[0].theirstoryId === citations[0].theirstoryId
          ) {
            showSourcesForMessage(msg.id);
            return;
          }
        }
      }
    },
    [messages, showSourcesForMessage],
  );

  const chatContextValue = { onViewSources: handleViewSources };

  return (
    <ChatContextProvider value={chatContextValue}>
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
    </ChatContextProvider>
  );
};
