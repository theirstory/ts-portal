'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Box, TextField, IconButton, Typography, Button, InputAdornment, Tooltip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useChatStore } from '@/app/stores/useChatStore';
import { ChatMessage as ChatMessageType } from '@/types/chat';
import { ChatMessage } from './ChatMessage';
import { colors } from '@/lib/theme';

const STARTER_QUESTIONS = [
  'What are interesting questions this collection could uniquely answer?',
  'What are common themes across the collection?',
];

type QAPair = { userMsg: ChatMessageType; assistantMsg: ChatMessageType };

export const ChatPanel = () => {
  const [input, setInput] = useState('');
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingStatus = useChatStore((s) => s.streamingStatus);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const showSourcesForMessage = useChatStore((s) => s.showSourcesForMessage);
  const scrollToCitationIndex = useChatStore((s) => s.scrollToCitationIndex);
  const clearScrollToCitation = useChatStore((s) => s.clearScrollToCitation);
  const activeAssistantMessageId = useChatStore((s) => s.activeAssistantMessageId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pairRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isEmpty = messages.length === 0;

  // Group messages into Q&A pairs
  const pairs = useMemo<QAPair[]>(() => {
    const result: QAPair[] = [];
    for (let i = 0; i < messages.length; i += 2) {
      if (messages[i]?.role === 'user' && messages[i + 1]?.role === 'assistant') {
        result.push({ userMsg: messages[i], assistantMsg: messages[i + 1] });
      }
    }
    return result;
  }, [messages]);

  const navigateToPair = useCallback((pairIndex: number) => {
    const pair = pairs[pairIndex];
    if (!pair) return;
    const el = pairRefs.current.get(pair.userMsg.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Update sources panel
    if (pair.assistantMsg.citations && pair.assistantMsg.citations.length > 0) {
      showSourcesForMessage(pair.assistantMsg.id);
    }
  }, [pairs, showSourcesForMessage]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Scroll to citation in chat when triggered from side panel — scoped to the correct Q&A pair
  useEffect(() => {
    if (scrollToCitationIndex === null || !messagesContainerRef.current) return;
    // Scope to the active assistant message's container so we scroll to the right Q&A pair
    let scope: Element = messagesContainerRef.current;
    if (activeAssistantMessageId) {
      const msgScope = messagesContainerRef.current.querySelector(`[data-assistant-message-id="${activeAssistantMessageId}"]`);
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
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 2, md: 3 },
        }}>
        <Box
          sx={{
            width: '100%',
            maxWidth: 680,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}>
          <Typography
            variant="h4"
            fontWeight={600}
            color={colors.text.primary}
            sx={{ textAlign: 'center', mb: 1 }}>
            Ask about the interviews
          </Typography>

          <Box
            component="form"
            onSubmit={handleSubmit}>
            <TextField
              fullWidth
              multiline
              maxRows={6}
              minRows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about the interviews..."
              variant="outlined"
              disabled={isStreaming}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end" sx={{ alignSelf: 'flex-end', mb: 0.5 }}>
                      <IconButton
                        type="submit"
                        disabled={!input.trim() || isStreaming}
                        sx={{
                          bgcolor: colors.primary.main,
                          color: colors.primary.contrastText,
                          '&:hover': { bgcolor: colors.primary.dark },
                          '&.Mui-disabled': { bgcolor: colors.grey[300] },
                          borderRadius: 2,
                          width: 36,
                          height: 36,
                        }}>
                        <SendIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: colors.background.paper,
                  borderRadius: 3,
                  fontSize: '1rem',
                  alignItems: 'flex-end',
                },
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
            {STARTER_QUESTIONS.map((q) => (
              <Button
                key={q}
                variant="outlined"
                fullWidth
                onClick={() => handleStarterClick(q)}
                sx={{
                  textTransform: 'none',
                  borderRadius: 2,
                  borderColor: colors.grey[300],
                  color: colors.text.primary,
                  fontSize: '0.875rem',
                  py: 1.5,
                  px: 3,
                  justifyContent: 'flex-start',
                  bgcolor: colors.background.paper,
                  boxShadow: `0 1px 3px ${colors.common.shadow}`,
                  '&:hover': {
                    borderColor: colors.primary.main,
                    bgcolor: colors.background.paper,
                    boxShadow: `0 2px 6px ${colors.common.shadow}`,
                  },
                }}>
                {q}
              </Button>
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: 900,
        mx: 'auto',
        width: '100%',
        px: { xs: 2, md: 3 },
      }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1.5, flexShrink: 0 }}>
        <Tooltip title="Clear conversation">
          <Button
            size="small"
            startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
            onClick={clearMessages}
            disabled={isStreaming}
            sx={{
              textTransform: 'none',
              fontSize: '0.8rem',
              color: colors.text.secondary,
              '&:hover': { color: colors.error.main, bgcolor: colors.error.light + '1a' },
            }}>
            Clear chat
          </Button>
        </Tooltip>
      </Box>
      <Box
        ref={messagesContainerRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
        {pairs.map((pair, pairIndex) => (
          <Box
            key={pair.userMsg.id}
            ref={(el: HTMLDivElement | null) => {
              if (el) pairRefs.current.set(pair.userMsg.id, el);
              else pairRefs.current.delete(pair.userMsg.id);
            }}>
            {/* Sticky user prompt */}
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                pt: 1,
                pb: 0.5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
              }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', width: '100%' }}>
                {pairs.length > 1 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    <IconButton
                      size="small"
                      disabled={pairIndex === 0}
                      onClick={() => navigateToPair(pairIndex - 1)}
                      sx={{ p: 0, color: colors.text.secondary, '&:hover': { color: colors.primary.main } }}>
                      <KeyboardArrowUpIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      disabled={pairIndex === pairs.length - 1}
                      onClick={() => navigateToPair(pairIndex + 1)}
                      sx={{ p: 0, color: colors.text.secondary, '&:hover': { color: colors.primary.main } }}>
                      <KeyboardArrowDownIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Box>
                )}
                <Box
                  sx={{
                    maxWidth: { xs: '85%', md: '70%' },
                    px: 2,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: colors.primary.main,
                    color: colors.primary.contrastText,
                    fontSize: '0.875rem',
                    lineHeight: 1.5,
                    boxShadow: `0 2px 8px ${colors.common.shadow}`,
                  }}>
                  {pair.userMsg.content}
                </Box>
              </Box>
              {pair.assistantMsg.citations && pair.assistantMsg.citations.length > 0 && (
                <Button
                  size="small"
                  startIcon={<FormatListBulletedIcon sx={{ fontSize: 14 }} />}
                  onClick={() => showSourcesForMessage(pair.assistantMsg.id)}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    color: colors.text.secondary,
                    py: 0.25,
                    px: 1,
                    minHeight: 0,
                    mt: 0.5,
                    '&:hover': { color: colors.primary.main },
                  }}>
                  View {pair.assistantMsg.citations.length} sources
                </Button>
              )}
            </Box>
            {/* Assistant response */}
            <Box sx={{ pt: 1.5 }} data-assistant-message-id={pair.assistantMsg.id}>
              {isStreaming && !pair.assistantMsg.content && streamingStatus ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: `2px solid ${colors.primary.main}`,
                      borderTopColor: 'transparent',
                      animation: 'spin 0.8s linear infinite',
                      flexShrink: 0,
                      '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
                    }}
                  />
                  <Typography variant="body2" color={colors.text.secondary} sx={{ fontSize: '0.85rem' }}>
                    {streamingStatus}
                  </Typography>
                </Box>
              ) : (
                <ChatMessage message={pair.assistantMsg} />
              )}
            </Box>
          </Box>
        ))}
        <div ref={messagesEndRef} />
      </Box>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          display: 'flex',
          gap: 1,
          py: 2,
          alignItems: 'flex-end',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about the interviews..."
          variant="outlined"
          size="small"
          disabled={isStreaming}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: colors.background.paper,
              borderRadius: 2,
            },
          }}
        />
        <IconButton
          type="submit"
          disabled={!input.trim() || isStreaming}
          sx={{
            bgcolor: colors.primary.main,
            color: colors.primary.contrastText,
            '&:hover': { bgcolor: colors.primary.dark },
            '&.Mui-disabled': { bgcolor: colors.grey[300] },
            borderRadius: 2,
            width: 40,
            height: 40,
          }}>
          <SendIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
};
