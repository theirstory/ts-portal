'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { usePathname } from 'next/navigation';
import { useChatStore } from '@/app/stores/useChatStore';
import { ChatInteractionProvider } from '@/app/discover/ChatInteractionContext';
import { SidePanelTranscriptView } from '@/app/discover/Components/SidePanelTranscriptView';
import { Citation } from '@/types/chat';
import { colors } from '@/lib/theme';
import { isChatEnabled } from '@/config/organizationConfig';
import {
  ChatComposer,
  ChatMessagesThread,
  ChatStarterQuestions,
  getChatCopy,
} from '@/app/discover/Components/SharedChatUI';
import { FloatingChatDrawerHeader } from './floating-chat-drawer/FloatingChatDrawerHeader';
import { FloatingChatRecordingView } from './floating-chat-drawer/FloatingChatRecordingView';
import { FloatingChatSearchResultsView } from './floating-chat-drawer/FloatingChatSearchResultsView';
import { FloatingChatSourcesView } from './floating-chat-drawer/FloatingChatSourcesView';
import { SearchType } from './floating-chat-drawer/helpers';

const DRAWER_WIDTH = 440;

type DrawerView = 'chat' | 'recording' | 'search' | 'transcript' | 'sources';

export const FloatingChatDrawer = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isMac, setIsMac] = useState(false);
  const [viewStack, setViewStack] = useState<DrawerView[]>(['chat']);
  const [activeCitation, setLocalActiveCitation] = useState<Citation | null>(null);
  const [drawerSearchResults, setDrawerSearchResults] = useState<Citation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('hybrid');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sourcesCitations, setSourcesCitations] = useState<Citation[]>([]);
  const [sourcesListMode, setSourcesListMode] = useState<'recording' | 'number'>('number');
  const [searchFilterTerm, setSearchFilterTerm] = useState('');
  const [sourcesFilterTerm, setSourcesFilterTerm] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingStatus = useChatStore((s) => s.streamingStatus);
  const selectedLanguage = useChatStore((s) => s.selectedLanguage);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setSelectedLanguage = useChatStore((s) => s.setSelectedLanguage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const storeSetTranscriptCitation = useChatStore((s) => s.openTranscript);

  const isChatPage = pathname.startsWith('/discover');
  const shouldShow = isChatEnabled && !isChatPage;
  const isEmpty = messages.length === 0;
  const currentView = viewStack[viewStack.length - 1];

  const pushView = useCallback((view: DrawerView) => {
    setViewStack((prev) => [...prev, view]);
  }, []);

  const popView = useCallback(() => {
    setViewStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  // Detect platform
  useEffect(() => {
    setIsMac(/Mac/i.test(navigator.userAgent));
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (!open || currentView !== 'chat') return;

    const container = messagesContainerRef.current;
    if (!container) return;

    if (isStreaming) {
      container.scrollTop = container.scrollHeight;
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open, currentView, isStreaming]);

  // Focus input when drawer opens to chat
  useEffect(() => {
    if (open && currentView === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, currentView]);

  // Cmd+K / Ctrl+K
  useEffect(() => {
    if (!shouldShow) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shouldShow]);

  // Context: citation click → show recording view
  const handleCitationClick = useCallback(
    (citation: Citation) => {
      setLocalActiveCitation(citation);
      pushView('recording');
    },
    [pushView],
  );

  // Context: open transcript
  const handleOpenTranscript = useCallback(
    (citation: Citation) => {
      // Set on store so SidePanelTranscriptView can read it
      storeSetTranscriptCitation(citation);
      pushView('transcript');
    },
    [pushView, storeSetTranscriptCitation],
  );

  // Context: search results → show inline
  const handleSearchResults = useCallback(
    (results: Citation[], query: string, type: SearchType) => {
      setDrawerSearchResults(results);
      setSearchQuery(query);
      setSearchType(type);
      setCollapsed(new Set());
      setSearchFilterTerm('');
      pushView('search');
    },
    [pushView],
  );

  // Context: goBack for transcript view
  const handleGoBack = useCallback(() => {
    popView();
  }, [popView]);

  // Context: view sources for a message
  const handleViewSources = useCallback(
    (citations: Citation[]) => {
      setSourcesCitations(citations);
      setCollapsed(new Set());
      setSourcesFilterTerm('');
      pushView('sources');
    },
    [pushView],
  );

  const chatContextValue = useMemo(
    () => ({
      onCitationClick: handleCitationClick,
      onSearchResults: handleSearchResults,
      onGoBack: handleGoBack,
      onOpenTranscript: handleOpenTranscript,
      onViewSources: handleViewSources,
    }),
    [handleCitationClick, handleSearchResults, handleGoBack, handleOpenTranscript, handleViewSources],
  );

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!shouldShow) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    setViewStack(['chat']);
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

  const shortcutLabel = isMac ? '⌘K' : 'Ctrl+K';
  const copy = getChatCopy(selectedLanguage);

  return (
    <ChatInteractionProvider value={chatContextValue}>
      {/* Floating AI button */}
      {!open && (
        <Tooltip title={isDesktop ? `Ask AI (${shortcutLabel})` : 'Ask AI'} placement="left">
          <IconButton
            onClick={() => setOpen(true)}
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 1200,
              width: 56,
              height: 56,
              bgcolor: colors.primary.main,
              color: colors.primary.contrastText,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              '&:hover': {
                bgcolor: colors.primary.dark,
                boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
              },
            }}>
            <AutoAwesomeIcon />
          </IconButton>
        </Tooltip>
      )}

      {/* Chat drawer */}
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        variant="persistent"
        sx={{
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            maxWidth: '100vw',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
            border: 'none',
          },
        }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <FloatingChatDrawerHeader
            isDesktop={isDesktop}
            isMobile={isMobile}
            shortcutLabel={shortcutLabel}
            hasMessages={messages.length > 0}
            onClear={() => {
              clearMessages();
              setViewStack(['chat']);
            }}
            onOpenFullChat={() => window.open('/discover', '_blank')}
            onClose={() => setOpen(false)}
          />

          {currentView === 'recording' && activeCitation && (
            <FloatingChatRecordingView citation={activeCitation} onBack={popView} onOpenTranscript={handleOpenTranscript} />
          )}

          {currentView === 'transcript' && (
            <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              <SidePanelTranscriptView />
            </Box>
          )}

          {currentView === 'search' && (
            <FloatingChatSearchResultsView
              results={drawerSearchResults}
              query={searchQuery}
              searchType={searchType}
              filterTerm={searchFilterTerm}
              collapsed={collapsed}
              onFilterChange={setSearchFilterTerm}
              onToggleCollapse={toggleCollapse}
              onBack={popView}
              onSelectCitation={handleCitationClick}
            />
          )}

          {currentView === 'sources' && (
            <FloatingChatSourcesView
              citations={sourcesCitations}
              filterTerm={sourcesFilterTerm}
              listMode={sourcesListMode}
              collapsed={collapsed}
              onBack={popView}
              onFilterChange={setSourcesFilterTerm}
              onListModeChange={setSourcesListMode}
              onToggleCollapse={toggleCollapse}
              onSelectCitation={handleCitationClick}
            />
          )}

          {currentView === 'chat' && (
            <>
              {isEmpty ? (
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ChatStarterQuestions
                    onStarterClick={handleStarterClick}
                    selectedLanguage={selectedLanguage}
                    variant="compact"
                  />
                </Box>
              ) : (
                <ChatMessagesThread
                  messages={messages}
                  isStreaming={isStreaming}
                  streamingStatus={streamingStatus}
                  messagesContainerRef={messagesContainerRef}
                  messagesEndRef={messagesEndRef}
                  onViewSources={(messageId) => {
                    const message = messages.find((msg) => msg.id === messageId);
                    if (message?.citations?.length) {
                      handleViewSources(message.citations);
                    }
                  }}
                  variant="compact"
                />
              )}

              <ChatComposer
                input={input}
                isStreaming={isStreaming}
                inputRef={inputRef}
                onInputChange={setInput}
                onSubmit={handleSubmit}
                onKeyDown={handleKeyDown}
                onStop={stopStreaming}
                placeholder={copy.placeholderShort}
                variant="compact"
                selectedLanguage={selectedLanguage}
                onLanguageChange={setSelectedLanguage}
              />
            </>
          )}
        </Box>
      </Drawer>
    </ChatInteractionProvider>
  );
};
