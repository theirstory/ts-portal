'use client';

import React, { useMemo, useRef, type MutableRefObject } from 'react';
import { Box, Button, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { ChatMessage as ChatMessageType } from '@/types/chat';
import { ChatMessage } from './ChatMessage';
import { TextSelectionPopover } from './TextSelectionPopover';
import { type ChatLanguage, LanguageSelector, VoiceInputButton, VoiceRecordingComposer } from './ChatComposerControls';
import { useVoiceRecorder } from './useVoiceRecorder';
import { colors } from '@/lib/theme';

type ChatCopy = {
  title: string;
  placeholderLong: string;
  placeholderShort: string;
  starterQuestions: string[];
};

const CHAT_COPY: Record<ChatLanguage, ChatCopy> = {
  English: {
    title: 'Ask about the interviews',
    placeholderLong: 'Ask a question about the interviews...',
    placeholderShort: 'Ask a question...',
    starterQuestions: [
      'What are interesting questions this collection could uniquely answer?',
      'What are common themes across the collection?',
    ],
  },
  Español: {
    title: 'Pregunta sobre las entrevistas',
    placeholderLong: 'Haz una pregunta sobre las entrevistas...',
    placeholderShort: 'Haz una pregunta...',
    starterQuestions: [
      '¿Qué preguntas interesantes podría responder de forma única esta colección?',
      '¿Cuáles son los temas más comunes en la colección?',
    ],
  },
  Français: {
    title: 'Posez des questions sur les entretiens',
    placeholderLong: 'Posez une question sur les entretiens...',
    placeholderShort: 'Posez une question...',
    starterQuestions: [
      'Quelles questions intéressantes cette collection pourrait-elle éclairer de façon unique ?',
      'Quels sont les thèmes communs dans l’ensemble de la collection ?',
    ],
  },
  Deutsch: {
    title: 'Fragen Sie zu den Interviews',
    placeholderLong: 'Stellen Sie eine Frage zu den Interviews...',
    placeholderShort: 'Stellen Sie eine Frage...',
    starterQuestions: [
      'Welche interessanten Fragen könnte diese Sammlung auf einzigartige Weise beantworten?',
      'Welche gemeinsamen Themen ziehen sich durch die Sammlung?',
    ],
  },
  Português: {
    title: 'Pergunte sobre as entrevistas',
    placeholderLong: 'Faça uma pergunta sobre as entrevistas...',
    placeholderShort: 'Faça uma pergunta...',
    starterQuestions: [
      'Que perguntas interessantes esta coleção poderia responder de forma única?',
      'Quais são os temas mais comuns em toda a coleção?',
    ],
  },
  Italiano: {
    title: 'Fai domande sulle interviste',
    placeholderLong: 'Fai una domanda sulle interviste...',
    placeholderShort: 'Fai una domanda...',
    starterQuestions: [
      'Quali domande interessanti potrebbe rispondere in modo unico questa collezione?',
      'Quali sono i temi comuni presenti nella collezione?',
    ],
  },
  Nederlands: {
    title: 'Stel vragen over de interviews',
    placeholderLong: 'Stel een vraag over de interviews...',
    placeholderShort: 'Stel een vraag...',
    starterQuestions: [
      'Welke interessante vragen kan deze collectie op een unieke manier beantwoorden?',
      'Welke veelvoorkomende thema’s komen in de hele collectie terug?',
    ],
  },
  Русский: {
    title: 'Спросите об интервью',
    placeholderLong: 'Задайте вопрос об интервью...',
    placeholderShort: 'Задайте вопрос...',
    starterQuestions: [
      'На какие интересные вопросы эта коллекция может ответить особенно хорошо?',
      'Какие общие темы встречаются во всей коллекции?',
    ],
  },
};

export function getChatCopy(language: string): ChatCopy {
  return CHAT_COPY[language as ChatLanguage] ?? CHAT_COPY.English;
}

type QAPair = { userMsg: ChatMessageType; assistantMsg: ChatMessageType };

type ChatMessagesThreadProps = {
  messages: ChatMessageType[];
  isStreaming: boolean;
  streamingStatus: string | null;
  messagesContainerRef: MutableRefObject<HTMLDivElement | null>;
  messagesEndRef: MutableRefObject<HTMLDivElement | null>;
  onViewSources: (messageId: string) => void;
  variant?: 'default' | 'compact';
};

type ChatComposerProps = {
  input: string;
  isStreaming: boolean;
  selectedLanguage: string;
  inputRef?: MutableRefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onLanguageChange: (language: ChatLanguage) => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onStop?: () => void;
  placeholder: string;
  variant?: 'default' | 'compact';
  fullHeight?: boolean;
};

type ChatStarterQuestionsProps = {
  onStarterClick: (question: string) => void;
  selectedLanguage?: string;
  variant?: 'default' | 'compact';
  showTitle?: boolean;
};

function buildQAPairs(messages: ChatMessageType[]): QAPair[] {
  const result: QAPair[] = [];
  for (let i = 0; i < messages.length; i += 2) {
    if (messages[i]?.role === 'user' && messages[i + 1]?.role === 'assistant') {
      result.push({ userMsg: messages[i], assistantMsg: messages[i + 1] });
    }
  }
  return result;
}

export function ChatStarterQuestions({
  onStarterClick,
  selectedLanguage = 'English',
  variant = 'default',
  showTitle = true,
}: ChatStarterQuestionsProps) {
  const compact = variant === 'compact';
  const copy = getChatCopy(selectedLanguage);

  return (
    <Box
      id={compact ? 'chat-starter-questions-compact' : 'chat-starter-questions'}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        px: compact ? 2 : { xs: 2, md: 3 },
        py: compact ? 4 : 0,
      }}>
      <Box
        id={compact ? 'chat-starter-questions-list-compact' : 'chat-starter-questions-list'}
        sx={{
          width: '100%',
          maxWidth: compact ? '100%' : 680,
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? 1 : 1.5,
        }}>
        {showTitle && (
          <Typography
            variant={compact ? 'body1' : 'h4'}
            fontWeight={600}
            color={colors.text.primary}
            sx={{ textAlign: 'center', mb: compact ? 2 : 1 }}>
            {copy.title}
          </Typography>
        )}

        {copy.starterQuestions.map((q) => (
          <Button
            id={`chat-starter-question-${q
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, '')}`}
            key={q}
            variant="outlined"
            fullWidth
            onClick={() => onStarterClick(q)}
            sx={{
              textTransform: 'none',
              borderRadius: 3,
              borderColor: colors.grey[300],
              color: colors.text.primary,
              fontSize: compact ? '0.8rem' : '0.875rem',
              py: compact ? 1.25 : 1.5,
              px: compact ? 2 : 3,
              justifyContent: 'flex-start',
              textAlign: 'left',
              bgcolor: colors.background.paper,
              boxShadow: compact ? 'none' : `0 1px 3px ${colors.common.shadow}`,
              '&:hover': {
                borderColor: colors.primary.main,
                bgcolor: compact ? colors.background.subtle : colors.background.paper,
                boxShadow: compact ? 'none' : `0 2px 6px ${colors.common.shadow}`,
              },
            }}>
            {q}
          </Button>
        ))}
      </Box>
    </Box>
  );
}

export function ChatMessagesThread({
  messages,
  isStreaming,
  streamingStatus,
  messagesContainerRef,
  messagesEndRef,
  onViewSources,
  variant = 'default',
}: ChatMessagesThreadProps) {
  const compact = variant === 'compact';
  const pairRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pairs = useMemo(() => buildQAPairs(messages), [messages]);

  const navigateToPair = (pairIndex: number) => {
    const pair = pairs[pairIndex];
    if (!pair) return;
    const el = pairRefs.current.get(pair.userMsg.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <Box
      id={compact ? 'chat-messages-thread-compact' : 'chat-messages-thread'}
      ref={messagesContainerRef}
      sx={{
        flex: 1,
        overflow: 'auto',
        minHeight: 0,
        position: 'relative',
        pb: compact ? 0 : 2,
        marginTop: 2,
        scrollbarWidth: 'auto',
        scrollbarColor: `${colors.primary.light} transparent`,
        '&::-webkit-scrollbar': {
          width: 12,
        },
        '&::-webkit-scrollbar-track': {
          backgroundColor: 'transparent',
          borderRadius: 999,
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: colors.primary.light,
          borderRadius: 999,
          border: '2px solid transparent',
          backgroundClip: 'padding-box',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          backgroundColor: colors.primary.main,
        },
      }}>
      <TextSelectionPopover containerRef={messagesContainerRef} />
      <Box
        id={compact ? 'chat-messages-list-compact' : 'chat-messages-list'}
        sx={{
          px: compact ? 2 : 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
        {pairs.map((pair, pairIndex) => (
          <Box
            id={`chat-message-pair-${pair.userMsg.id}`}
            key={pair.userMsg.id}
            ref={(el: HTMLDivElement | null) => {
              if (el) pairRefs.current.set(pair.userMsg.id, el);
              else pairRefs.current.delete(pair.userMsg.id);
            }}>
            <Box
              id={`chat-message-sticky-${pair.userMsg.id}`}
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                pb: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                width: '100%',
                background: `linear-gradient(180deg, ${colors.background.storyPage} 0%, ${colors.background.storyPage} 78%, rgba(224, 224, 224, 0) 100%)`,
              }}>
              <Box
                sx={{
                  overflow: 'hidden',
                  borderRadius: 1,
                  px: compact ? 1 : 1.25,
                  py: compact ? 0.9 : 1,
                  color: colors.common.white,
                  background: `linear-gradient(135deg, ${colors.primary.dark} 0%, ${colors.primary.main} 100%)`,
                  boxShadow: `0 6px 18px ${colors.common.shadow}`,
                }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                  {pairs.length > 1 && (
                    <Box
                      id={`chat-pair-navigation-${pair.userMsg.id}`}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        flexShrink: 0,
                        gap: 0.25,
                        px: 0.25,
                      }}>
                      <IconButton
                        size="small"
                        disabled={pairIndex === 0}
                        onClick={() => navigateToPair(pairIndex - 1)}
                        sx={{
                          p: 0.25,
                          color: 'rgba(255,255,255,0.88)',
                          bgcolor: 'rgba(255,255,255,0.08)',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.14)' },
                          '&.Mui-disabled': { color: 'rgba(255,255,255,0.28)' },
                        }}>
                        <KeyboardArrowUpIcon sx={{ fontSize: compact ? 18 : 20 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={pairIndex === pairs.length - 1}
                        onClick={() => navigateToPair(pairIndex + 1)}
                        sx={{
                          p: 0.25,
                          color: 'rgba(255,255,255,0.88)',
                          bgcolor: 'rgba(255,255,255,0.08)',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.14)' },
                          '&.Mui-disabled': { color: 'rgba(255,255,255,0.28)' },
                        }}>
                        <KeyboardArrowDownIcon sx={{ fontSize: compact ? 18 : 20 }} />
                      </IconButton>
                    </Box>
                  )}
                  <Box
                    sx={{
                      minWidth: 0,
                      flex: 1,
                      px: compact ? 0.75 : 0.5,
                      py: compact ? 0.2 : 0.25,
                      fontSize: compact ? '0.8rem' : '0.875rem',
                      lineHeight: 1.5,
                      fontWeight: 500,
                    }}>
                    {pair.userMsg.content}
                  </Box>
                  {pair.assistantMsg.citations && pair.assistantMsg.citations.length > 0 && (
                    <Button
                      id={`chat-view-sources-${pair.assistantMsg.id}`}
                      size="small"
                      startIcon={<FormatListBulletedIcon sx={{ fontSize: 14 }} />}
                      onClick={() => onViewSources(pair.assistantMsg.id)}
                      sx={{
                        flexShrink: 0,
                        textTransform: 'none',
                        fontSize: compact ? '0.72rem' : '0.76rem',
                        color: colors.primary.contrastText,
                        px: 1.25,
                        py: 0.55,
                        minHeight: 0,
                        borderRadius: 999,
                        bgcolor: 'rgba(255,255,255,0.14)',
                        border: '1px solid rgba(255,255,255,0.16)',
                        '&:hover': {
                          bgcolor: 'rgba(255,255,255,0.22)',
                        },
                      }}>
                      {pair.assistantMsg.citations.length} sources
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>
            <Box sx={{ pt: compact ? 1 : 1.5 }} data-assistant-message-id={pair.assistantMsg.id}>
              {isStreaming && !pair.assistantMsg.content && streamingStatus ? (
                <Box
                  id={`chat-streaming-status-${pair.assistantMsg.id}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: compact ? 1 : 1.5,
                    px: compact ? 1.5 : 2,
                    py: compact ? 1 : 1.5,
                  }}>
                  <Box
                    sx={{
                      width: compact ? 16 : 20,
                      height: compact ? 16 : 20,
                      borderRadius: '50%',
                      border: `2px solid ${colors.primary.main}`,
                      borderTopColor: 'transparent',
                      animation: 'spin 0.8s linear infinite',
                      flexShrink: 0,
                      '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
                    }}
                  />
                  <Typography
                    variant="body2"
                    color={colors.text.secondary}
                    sx={{ fontSize: compact ? '0.8rem' : '0.85rem' }}>
                    {streamingStatus}
                  </Typography>
                </Box>
              ) : (
                <Box id={`chat-assistant-response-${pair.assistantMsg.id}`}>
                  <ChatMessage message={pair.assistantMsg} />
                </Box>
              )}
            </Box>
          </Box>
        ))}
        <div id="chat-messages-end" ref={messagesEndRef} />
      </Box>
    </Box>
  );
}

export function ChatComposer({
  input,
  isStreaming,
  selectedLanguage,
  inputRef,
  onInputChange,
  onLanguageChange,
  onSubmit,
  onKeyDown,
  onStop,
  placeholder,
  variant = 'default',
  fullHeight = false,
}: ChatComposerProps) {
  const compact = variant === 'compact';
  const voiceRecorder = useVoiceRecorder({
    language: selectedLanguage,
    inputValue: input,
    onConfirmText: onInputChange,
  });
  const voiceInputTooltip = voiceRecorder.errorMessage
    ? voiceRecorder.errorMessage
    : isStreaming
      ? 'Voice input is unavailable while the chat is responding'
      : voiceRecorder.unavailableReason ?? undefined;

  if (voiceRecorder.isRecording) {
    return (
      <VoiceRecordingComposer
        audioLevels={voiceRecorder.audioLevels}
        compact={compact}
        onCancel={voiceRecorder.cancelRecording}
        onConfirm={voiceRecorder.confirmRecording}
      />
    );
  }

  return (
    <Box
      id={compact ? 'chat-composer-compact' : fullHeight ? 'chat-composer-empty' : 'chat-composer'}
      component="form"
      onSubmit={onSubmit}
      sx={{
        display: 'flex',
        gap: 1,
        px: compact ? 1 : 0,
        py: compact ? 1 : 2,
        alignItems: compact ? 'center' : 'flex-end',
        flexShrink: 0,
      }}>
      <TextField
        id={compact ? 'chat-composer-input-compact' : fullHeight ? 'chat-composer-input-empty' : 'chat-composer-input'}
        inputRef={inputRef}
        fullWidth
        multiline
        maxRows={compact ? 4 : 6}
        minRows={fullHeight ? 3 : undefined}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        variant="outlined"
        size={compact ? 'small' : 'medium'}
        disabled={isStreaming}
        slotProps={
          fullHeight
            ? {
                input: {
                  endAdornment: (
                    <InputAdornment
                      position="end"
                      sx={{
                        alignSelf: 'flex-end',
                        mr: 0.5,
                        mb: 0.5,
                        pointerEvents: 'auto',
                        position: 'relative',
                        zIndex: 2,
                      }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pointerEvents: 'auto' }}>
                        <LanguageSelector selectedLanguage={selectedLanguage} onLanguageChange={onLanguageChange} />
                        <VoiceInputButton
                          disabled={!voiceRecorder.isSupported || isStreaming}
                          disabledReason={voiceInputTooltip}
                          isRecording={voiceRecorder.isRecording}
                          isSupported={voiceRecorder.isSupported}
                          onClick={voiceRecorder.startRecording}
                        />
                        <IconButton
                          type={isStreaming ? 'button' : 'submit'}
                          onClick={isStreaming ? onStop : undefined}
                          disabled={isStreaming ? !onStop : !input.trim()}
                          sx={{
                            bgcolor: isStreaming ? colors.error.main : colors.primary.main,
                            color: colors.primary.contrastText,
                            '&:hover': { bgcolor: isStreaming ? colors.error.main : colors.primary.dark },
                            '&.Mui-disabled': { bgcolor: colors.grey[300] },
                            borderRadius: '50%',
                            width: 44,
                            height: 44,
                          }}>
                          {isStreaming ? <StopIcon sx={{ fontSize: 18 }} /> : <SendIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                      </Box>
                    </InputAdornment>
                  ),
                },
              }
            : undefined
        }
        sx={{
          '& .MuiOutlinedInput-root': {
            bgcolor: colors.background.paper,
            alignItems: fullHeight ? 'flex-end' : undefined,
            fontSize: fullHeight ? '1rem' : undefined,
            boxShadow: compact ? `0 1px 2px ${colors.common.shadow}` : 'none',
            minHeight: compact ? 52 : undefined,
            borderRadius: fullHeight ? 4 : compact ? 3 : undefined,
            '& fieldset': {
              borderColor: fullHeight || compact ? colors.grey[300] : undefined,
            },
            '&:hover fieldset': {
              borderColor: fullHeight || compact ? colors.grey[400] : undefined,
            },
            '&.Mui-focused fieldset': {
              borderColor: fullHeight || compact ? colors.primary.light : undefined,
            },
          },
          '& .MuiInputAdornment-root': {
            pointerEvents: 'auto',
          },
        }}
      />
      {!fullHeight && (
        <>
          <LanguageSelector
            selectedLanguage={selectedLanguage}
            onLanguageChange={onLanguageChange}
            compact={compact}
          />
          <VoiceInputButton
            compact={compact}
            disabled={!voiceRecorder.isSupported || isStreaming}
            disabledReason={voiceInputTooltip}
            isRecording={voiceRecorder.isRecording}
            isSupported={voiceRecorder.isSupported}
            onClick={voiceRecorder.startRecording}
          />
          <IconButton
            id={compact ? 'chat-composer-submit-compact' : 'chat-composer-submit'}
            type={isStreaming ? 'button' : 'submit'}
            onClick={isStreaming ? onStop : undefined}
            disabled={isStreaming ? !onStop : !input.trim()}
            sx={{
              bgcolor: isStreaming ? colors.error.main : colors.primary.main,
              color: colors.primary.contrastText,
              '&:hover': { bgcolor: isStreaming ? colors.error.main : colors.primary.dark },
              '&.Mui-disabled': { bgcolor: colors.grey[300] },
              borderRadius: '50%',
              alignSelf: 'center',
              mt: compact ? -0.25 : 0,
              width: compact ? 36 : 40,
              height: compact ? 36 : 40,
            }}>
            {isStreaming ? <StopIcon fontSize="small" /> : <SendIcon fontSize="small" />}
          </IconButton>
        </>
      )}
    </Box>
  );
}
