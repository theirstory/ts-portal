'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Box, Button, Tooltip, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useChatStore } from '@/app/stores/useChatStore';
import { colors } from '@/lib/theme';
import { ChatComposer, ChatMessagesThread, ChatStarterQuestions, getChatCopy } from './SharedChatUI';

export const ChatPanel = () => {
  const [input, setInput] = useState('');
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingStatus = useChatStore((s) => s.streamingStatus);
  const selectedLanguage = useChatStore((s) => s.selectedLanguage);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setSelectedLanguage = useChatStore((s) => s.setSelectedLanguage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const showSourcesForMessage = useChatStore((s) => s.showSourcesForMessage);
  const scrollToCitationIndex = useChatStore((s) => s.scrollToCitationIndex);
  const clearScrollToCitation = useChatStore((s) => s.clearScrollToCitation);
  const activeAssistantMessageId = useChatStore((s) => s.activeAssistantMessageId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isEmpty = messages.length === 0;
  const copy = getChatCopy(selectedLanguage);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isStreaming) {
      container.scrollTop = container.scrollHeight;
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isStreaming]);

  // Scroll to citation in chat when triggered from side panel — scoped to the correct Q&A pair
  useEffect(() => {
    if (scrollToCitationIndex === null || !messagesContainerRef.current) return;
    // Scope to the active assistant message's container so we scroll to the right Q&A pair
    let scope: Element = messagesContainerRef.current;
    if (activeAssistantMessageId) {
      const msgScope = messagesContainerRef.current.querySelector(
        `[data-assistant-message-id="${activeAssistantMessageId}"]`,
      );
      if (msgScope) scope = msgScope;
    }
    const el = scope.querySelector(`[data-citation-index="${scrollToCitationIndex}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    clearScrollToCitation();
  }, [scrollToCitationIndex, clearScrollToCitation, activeAssistantMessageId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleStarterClick = (question: string) => {
    if (isStreaming) return;
    sendMessage(question);
  };

  if (isEmpty) {
    return (
      <Box
        id="chat-panel-empty"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 2, md: 3 },
        }}>
        <Box
          id="chat-panel-empty-content"
          sx={{
            width: '100%',
            maxWidth: 680,
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
          }}>
          <Typography
            variant="h4"
            fontWeight={700}
            color={colors.text.primary}
            sx={{ textAlign: 'center', mb: 0.5 }}>
            {copy.title}
          </Typography>

          <ChatComposer
            input={input}
            isStreaming={isStreaming}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            onStop={stopStreaming}
            placeholder={copy.placeholderLong}
            fullHeight
            selectedLanguage={selectedLanguage}
            onLanguageChange={setSelectedLanguage}
          />

          <Box sx={{ mt: 2 }}>
            <ChatStarterQuestions
              onStarterClick={handleStarterClick}
              selectedLanguage={selectedLanguage}
              showTitle={false}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      id="chat-panel"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: 900,
        mx: 'auto',
        width: '100%',
        px: { xs: 2, md: 3 },
        pb: 1,
      }}>
      <ChatMessagesThread
        messages={messages}
        isStreaming={isStreaming}
        streamingStatus={streamingStatus}
        messagesContainerRef={messagesContainerRef}
        messagesEndRef={messagesEndRef}
        onViewSources={showSourcesForMessage}
      />
      <Box
        id="chat-panel-actions"
        sx={{ display: 'flex', justifyContent: 'flex-end', pt: 0.25, pb: 0.25, flexShrink: 0 }}>
        <Tooltip title="Clear conversation">
          <Button
            id="chat-clear-button"
            size="small"
            startIcon={<DeleteOutlineIcon sx={{ fontSize: 15 }} />}
            onClick={clearMessages}
            disabled={isStreaming}
            sx={{
              color: colors.text.secondary,
              textTransform: 'none',
              fontSize: '0.75rem',
              minHeight: 0,
              borderRadius: 999,
              px: 1,
              py: 0.25,
              '&:hover': { color: colors.error.main, bgcolor: colors.error.light + '1a' },
            }}>
            Clear chat
          </Button>
        </Tooltip>
      </Box>
      <ChatComposer
        input={input}
        isStreaming={isStreaming}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        onStop={stopStreaming}
        placeholder={copy.placeholderLong}
        variant="compact"
        selectedLanguage={selectedLanguage}
        onLanguageChange={setSelectedLanguage}
      />
    </Box>
  );
};
