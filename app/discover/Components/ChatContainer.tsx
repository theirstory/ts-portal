'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { ChatPanel } from './ChatPanel';
import { SidePanel } from './SidePanel';
import { TextSelectionPopover } from './TextSelectionPopover';
import { ChatInteractionProvider } from '@/app/discover/ChatInteractionContext';
import { useChatStore } from '@/app/stores/useChatStore';
import { Citation, ChatMessage } from '@/types/chat';

const hasCitations = (message: ChatMessage) => message.role === 'assistant' && Boolean(message.citations?.length);

const findLastAssistantMessageWithCitations = (messages: ChatMessage[]) => {
  return [...messages].reverse().find(hasCitations);
};

const findAssistantMessageByCitations = (messages: ChatMessage[], citations: Citation[]) => {
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.citations === citations) {
      return msg;
    }
  }

  if (citations.length === 0) return undefined;

  const [firstCitation] = citations;

  return messages.find(
    (msg) =>
      hasCitations(msg) &&
      msg.citations![0].index === firstCitation.index &&
      msg.citations![0].theirstoryId === firstCitation.theirstoryId,
  );
};

export const ChatContainer = () => {
  const sidePanelMode = useChatStore((s) => s.sidePanelMode);
  const messages = useChatStore((s) => s.messages);
  const showSourcesForMessage = useChatStore((s) => s.showSourcesForMessage);
  const containerRef = useRef<HTMLDivElement>(null);
  const didAutoOpenSourcesRef = useRef(false);
  const isSidePanelOpen = sidePanelMode !== 'hidden';

  // Auto-open sources once when existing chat context becomes available.
  useEffect(() => {
    if (didAutoOpenSourcesRef.current || sidePanelMode !== 'hidden') return;

    const lastAssistantMessage = findLastAssistantMessageWithCitations(messages);
    if (!lastAssistantMessage) return;

    didAutoOpenSourcesRef.current = true;
    showSourcesForMessage(lastAssistantMessage.id);
  }, [messages, showSourcesForMessage, sidePanelMode]);

  const handleViewSources = useCallback(
    (citations: Citation[]) => {
      const assistantMessage = findAssistantMessageByCitations(messages, citations);
      if (assistantMessage) {
        showSourcesForMessage(assistantMessage.id);
      }
    },
    [messages, showSourcesForMessage],
  );

  const chatContextValue = { onViewSources: handleViewSources };

  return (
    <ChatInteractionProvider value={chatContextValue}>
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
    </ChatInteractionProvider>
  );
};
