'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  TextField,
  Typography,
  Tooltip,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import DescriptionIcon from '@mui/icons-material/Description';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FolderIcon from '@mui/icons-material/Folder';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MuxPlayer from '@mux/mux-player-react';
import { usePathname } from 'next/navigation';
import { useChatStore } from '@/app/stores/useChatStore';
import { ChatMessage } from '@/app/discover/Components/ChatMessage';
import { ChatMessage as ChatMessageType } from '@/types/chat';
import { ChatContextProvider } from '@/app/discover/ChatContext';
import { TextSelectionPopover } from '@/app/discover/Components/TextSelectionPopover';
import { SidePanelTranscriptView } from '@/app/discover/Components/SidePanelTranscriptView';
import { Citation } from '@/types/chat';
import { colors } from '@/lib/theme';
import { isChatEnabled } from '@/config/organizationConfig';
import { getMuxPlaybackId } from '@/app/utils/converters';
import { highlightSearchText } from '@/app/indexes/highlightSearch';

const STARTER_QUESTIONS = [
  'What are common themes across the collection?',
  'What are interesting questions this collection could uniquely answer?',
];

const DRAWER_WIDTH = 440;

type DrawerView = 'chat' | 'recording' | 'search' | 'transcript' | 'sources';
type SearchType = 'bm25' | 'vector' | 'hybrid';

const SEARCH_TYPE_LABELS: Record<string, string> = {
  bm25: 'Keyword',
  vector: 'Thematic',
  hybrid: 'Hybrid',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type RecordingGroup = {
  theirstoryId: string;
  interviewTitle: string;
  videoUrl: string;
  isAudioFile: boolean;
  results: Citation[];
};

function groupByRecording(citations: Citation[]): RecordingGroup[] {
  const map = new Map<string, Citation[]>();
  const order: string[] = [];
  const meta = new Map<string, { interviewTitle: string; videoUrl: string; isAudioFile: boolean }>();

  for (const c of citations) {
    const id = c.theirstoryId;
    if (!map.has(id)) {
      map.set(id, []);
      order.push(id);
      meta.set(id, { interviewTitle: c.interviewTitle, videoUrl: c.videoUrl, isAudioFile: c.isAudioFile ?? false });
    }
    map.get(id)!.push(c);
  }

  return order.map((id) => ({
    theirstoryId: id,
    ...meta.get(id)!,
    results: map.get(id)!.sort((a, b) => a.startTime - b.startTime),
  }));
}

export const FloatingChatDrawer = () => {
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
  const pairRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingStatus = useChatStore((s) => s.streamingStatus);
  const sendMessage = useChatStore((s) => s.sendMessage);
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
    setViewStack((prev) => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  // Detect platform
  useEffect(() => {
    setIsMac(/Mac/i.test(navigator.userAgent));
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (open && currentView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, currentView]);

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
  const handleCitationClick = useCallback((citation: Citation) => {
    setLocalActiveCitation(citation);
    pushView('recording');
  }, [pushView]);

  // Context: open transcript
  const handleOpenTranscript = useCallback((citation: Citation) => {
    // Set on store so SidePanelTranscriptView can read it
    storeSetTranscriptCitation(citation);
    pushView('transcript');
  }, [pushView, storeSetTranscriptCitation]);

  // Context: search results → show inline
  const handleSearchResults = useCallback((results: Citation[], query: string, type: SearchType) => {
    setDrawerSearchResults(results);
    setSearchQuery(query);
    setSearchType(type);
    setCollapsed(new Set());
    setSearchFilterTerm('');
    pushView('search');
  }, [pushView]);

  // Context: goBack for transcript view
  const handleGoBack = useCallback(() => {
    popView();
  }, [popView]);

  // Context: view sources for a message
  const handleViewSources = useCallback((citations: Citation[]) => {
    setSourcesCitations(citations);
    setCollapsed(new Set());
    setSourcesFilterTerm('');
    pushView('sources');
  }, [pushView]);

  const chatContextValue = useMemo(() => ({
    onCitationClick: handleCitationClick,
    onSearchResults: handleSearchResults,
    onGoBack: handleGoBack,
    onOpenTranscript: handleOpenTranscript,
    onViewSources: handleViewSources,
  }), [handleCitationClick, handleSearchResults, handleGoBack, handleOpenTranscript, handleViewSources]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Group messages into Q&A pairs
  type QAPair = { userMsg: ChatMessageType; assistantMsg: ChatMessageType };
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
  }, [pairs]);

  const filteredSearchResults = useMemo(() => {
    const q = searchFilterTerm.trim().toLowerCase();
    if (!q) return drawerSearchResults;
    return drawerSearchResults.filter((c) =>
      c.interviewTitle.toLowerCase().includes(q) ||
      c.sectionTitle.toLowerCase().includes(q) ||
      c.transcription.toLowerCase().includes(q) ||
      c.speaker.toLowerCase().includes(q),
    );
  }, [drawerSearchResults, searchFilterTerm]);

  const filteredSourcesCitations = useMemo(() => {
    const q = sourcesFilterTerm.trim().toLowerCase();
    if (!q) return sourcesCitations;
    return sourcesCitations.filter((c) =>
      c.interviewTitle.toLowerCase().includes(q) ||
      c.sectionTitle.toLowerCase().includes(q) ||
      c.transcription.toLowerCase().includes(q) ||
      c.speaker.toLowerCase().includes(q),
    );
  }, [sourcesCitations, sourcesFilterTerm]);

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
  const searchHighlight = searchFilterTerm.trim() || searchQuery;
  const groups = groupByRecording(filteredSearchResults);

  return (
    <ChatContextProvider value={chatContextValue}>
      {/* Floating AI button */}
      {!open && (
        <Tooltip title={`Ask AI (${shortcutLabel})`} placement="left">
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
          {/* Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: colors.primary.main,
              color: colors.primary.contrastText,
              flexShrink: 0,
            }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AutoAwesomeIcon sx={{ fontSize: 20 }} />
              <Typography variant="subtitle2" fontWeight={700}>
                Ask AI
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                {shortcutLabel}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {messages.length > 0 && (
                <Tooltip title="Clear conversation">
                  <IconButton
                    size="small"
                    onClick={() => { clearMessages(); setViewStack(['chat']); }}
                    sx={{ color: colors.primary.contrastText }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Open full chat">
                <IconButton
                  size="small"
                  onClick={() => window.open('/discover', '_blank')}
                  sx={{ color: colors.primary.contrastText }}>
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton
                size="small"
                onClick={() => setOpen(false)}
                sx={{ color: colors.primary.contrastText }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* ===== RECORDING VIEW ===== */}
          {currentView === 'recording' && activeCitation && (
            <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Back button + open in new tab */}
              <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Button
                  size="small"
                  startIcon={<ArrowBackIcon />}
                  onClick={popView}
                  sx={{ textTransform: 'none' }}>
                  Back
                </Button>
                <Tooltip title="Open recording in new tab">
                  <IconButton
                    size="small"
                    onClick={() => window.open(`/story/${activeCitation.theirstoryId}?start=${activeCitation.startTime}`, '_blank')}>
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              {/* Video player */}
              <Box sx={{ flexShrink: 0, bgcolor: colors.common.black }}>
                <MuxPlayer
                  src={activeCitation.videoUrl}
                  audio={activeCitation.isAudioFile}
                  startTime={activeCitation.startTime}
                  forwardSeekOffset={10}
                  backwardSeekOffset={10}
                  accentColor={colors.secondary.main}
                  style={{ width: '100%', aspectRatio: activeCitation.isAudioFile ? 'auto' : '16/9' }}
                />
              </Box>

              {/* Citation details */}
              <Box sx={{ px: 2, py: 2, flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                  {activeCitation.interviewTitle}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  {activeCitation.isChapterSynopsis ? 'Chapter Summary' : activeCitation.speaker}
                  {' · '}
                  {activeCitation.sectionTitle}
                  {' · '}
                  {formatTime(activeCitation.startTime)}–{formatTime(activeCitation.endTime)}
                </Typography>

                {/* Quote block */}
                <Box
                  sx={{
                    borderLeft: `3px solid ${activeCitation.isChapterSynopsis ? colors.success.main : colors.primary.main}`,
                    pl: 2,
                    py: 1,
                    mb: 3,
                  }}>
                  <Typography variant="body2" sx={{ fontStyle: 'italic', lineHeight: 1.6 }}>
                    &ldquo;{activeCitation.transcription}&rdquo;
                  </Typography>
                </Box>

                {/* Open Full Transcript */}
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<DescriptionIcon />}
                  onClick={() => handleOpenTranscript(activeCitation)}
                  sx={{
                    textTransform: 'none',
                    borderRadius: 2,
                    py: 1.25,
                    mb: 1.5,
                  }}>
                  Open Full Transcript
                </Button>

              </Box>
            </Box>
          )}

          {/* ===== TRANSCRIPT VIEW ===== */}
          {currentView === 'transcript' && (
            <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              <SidePanelTranscriptView />
            </Box>
          )}

          {/* ===== SEARCH RESULTS VIEW ===== */}
          {currentView === 'search' && (
            <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Back button */}
              <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                <Button
                  size="small"
                  startIcon={<ArrowBackIcon />}
                  onClick={popView}
                  sx={{ textTransform: 'none' }}>
                  Back to chat
                </Button>
              </Box>

              {/* Search query header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1.5,
                  bgcolor: colors.primary.main,
                  color: colors.primary.contrastText,
                  flexShrink: 0,
                }}>
                <SearchIcon sx={{ fontSize: 18 }} />
                <Typography variant="body2" fontWeight={500}>
                  &ldquo;{searchQuery}&rdquo;
                </Typography>
                <Typography variant="caption" sx={{ ml: 'auto', opacity: 0.85 }}>
                  {drawerSearchResults.length} result{drawerSearchResults.length !== 1 ? 's' : ''}
                  {' · '}
                  {SEARCH_TYPE_LABELS[searchType] || ''}
                </Typography>
              </Box>

              {/* Filter input */}
              <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, bgcolor: colors.background.paper }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Filter results..."
                  value={searchFilterTerm}
                  onChange={(e) => setSearchFilterTerm(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ bgcolor: colors.background.default, borderRadius: '8px' }}
                />
              </Box>

              {/* Scrollable results */}
              <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {filteredSearchResults.length === 0 ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No results found
                    </Typography>
                  </Box>
                ) : (
                  groups.map((group) => {
                    const playbackId = getMuxPlaybackId(group.videoUrl);
                    const thumbnailUrl = playbackId && !group.isAudioFile
                      ? `https://image.mux.com/${playbackId}/thumbnail.jpg?width=320&height=180&fit_mode=crop`
                      : null;
                    const isCollapsed = collapsed.has(group.theirstoryId);

                    return (
                      <Box key={group.theirstoryId} sx={{ borderBottom: '2px solid', borderColor: 'divider' }}>
                        <Box
                          onClick={() => toggleCollapse(group.theirstoryId)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            px: 2,
                            py: 1.5,
                            bgcolor: colors.grey[50],
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                            cursor: 'pointer',
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            '&:hover': { bgcolor: colors.grey[100] },
                          }}>
                          <ExpandMoreIcon
                            sx={{
                              fontSize: 20,
                              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s',
                              flexShrink: 0,
                            }}
                          />
                          {thumbnailUrl ? (
                            <Box
                              component="img"
                              src={thumbnailUrl}
                              alt={group.interviewTitle}
                              sx={{ width: 48, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 1, bgcolor: colors.grey[200], flexShrink: 0 }}
                            />
                          ) : (
                            <Box sx={{ width: 48, aspectRatio: '16/9', bgcolor: colors.grey[200], borderRadius: 1, flexShrink: 0 }} />
                          )}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3, fontSize: '0.8rem' }}>
                              {highlightSearchText(group.interviewTitle, searchHighlight)}
                            </Typography>
                            {isCollapsed && (
                              <Typography variant="caption" color="text.secondary">
                                {group.results.length} result{group.results.length !== 1 ? 's' : ''}
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {!isCollapsed && group.results.map((citation, idx) => (
                          <Box
                            key={`${citation.startTime}-${idx}`}
                            onClick={() => handleCitationClick(citation)}
                            sx={{
                              pl: 2,
                              pr: 2,
                              py: 1.25,
                              cursor: 'pointer',
                              borderLeft: `3px solid ${colors.primary.main}`,
                              '&:hover': { bgcolor: colors.grey[50] },
                              transition: 'background-color 0.15s',
                            }}>
                            <Typography variant="caption" color="text.secondary">
                              {highlightSearchText(citation.speaker, searchHighlight)} &middot;{' '}
                              {highlightSearchText(citation.sectionTitle, searchHighlight)} &middot;{' '}
                              {formatTime(citation.startTime)}–{formatTime(citation.endTime)}
                            </Typography>
                            <Typography
                              variant="body2"
                              color="text.primary"
                              sx={{
                                mt: 0.5,
                                lineHeight: 1.5,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}>
                              {highlightSearchText(citation.transcription, searchHighlight)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    );
                  })
                )}
              </Box>
            </Box>
          )}

          {/* ===== SOURCES VIEW ===== */}
          {currentView === 'sources' && (
            <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Back button */}
              <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                <Button
                  size="small"
                  startIcon={<ArrowBackIcon />}
                  onClick={popView}
                  sx={{ textTransform: 'none' }}>
                  Back to chat
                </Button>
              </Box>

              {/* Sources header with toggle */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1.5,
                  bgcolor: colors.grey[100],
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  flexShrink: 0,
                }}>
                <FormatListBulletedIcon sx={{ fontSize: 18, color: colors.text.secondary }} />
                <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                  {sourcesCitations.length} source{sourcesCitations.length !== 1 ? 's' : ''}
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={sourcesListMode}
                  onChange={(_, val) => { if (val) setSourcesListMode(val); }}
                  sx={{ height: 26 }}>
                  <ToggleButton value="number" sx={{ px: 0.75, py: 0, textTransform: 'none' }}>
                    <Tooltip title="Sort by citation number">
                      <FormatListNumberedIcon sx={{ fontSize: 16 }} />
                    </Tooltip>
                  </ToggleButton>
                  <ToggleButton value="recording" sx={{ px: 0.75, py: 0, textTransform: 'none' }}>
                    <Tooltip title="Group by recording">
                      <FolderIcon sx={{ fontSize: 16 }} />
                    </Tooltip>
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Filter input */}
              <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, bgcolor: colors.background.paper }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Filter sources..."
                  value={sourcesFilterTerm}
                  onChange={(e) => setSourcesFilterTerm(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ bgcolor: colors.background.default, borderRadius: '8px' }}
                />
              </Box>

              {/* Scrollable sources */}
              <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {sourcesListMode === 'number' ? (
                  // Numbered view — sorted by citation index with thumbnails
                  [...filteredSourcesCitations].sort((a, b) => a.index - b.index).map((citation) => {
                    const playbackId = getMuxPlaybackId(citation.videoUrl);
                    const thumbnailUrl = playbackId && !citation.isAudioFile
                      ? `https://image.mux.com/${playbackId}/thumbnail.jpg?width=320&height=180&fit_mode=crop&time=${Math.floor(citation.startTime)}`
                      : null;
                    return (
                      <Box
                        key={`num-${citation.index}`}
                        onClick={() => handleCitationClick(citation)}
                        sx={{
                          display: 'flex',
                          gap: 1.5,
                          px: 2,
                          py: 1.25,
                          cursor: 'pointer',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          borderLeft: `3px solid ${citation.isChapterSynopsis ? colors.success.main : colors.primary.main}`,
                          '&:hover': { bgcolor: colors.grey[50] },
                          transition: 'background-color 0.15s',
                        }}>
                        {thumbnailUrl ? (
                          <Box
                            component="img"
                            src={thumbnailUrl}
                            alt={citation.interviewTitle}
                            sx={{ width: 48, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 1, bgcolor: colors.grey[200], flexShrink: 0, alignSelf: 'flex-start', mt: 0.25 }}
                          />
                        ) : (
                          <Box sx={{ width: 48, aspectRatio: '16/9', bgcolor: colors.grey[200], borderRadius: 1, flexShrink: 0, alignSelf: 'flex-start', mt: 0.25 }} />
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                            <Box
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: citation.isChapterSynopsis ? colors.success.main : colors.primary.main,
                                color: colors.primary.contrastText,
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                borderRadius: '4px',
                                px: 0.5,
                                minWidth: 18,
                                lineHeight: 1.4,
                              }}>
                              {citation.index}
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap>
                              {citation.isChapterSynopsis
                                ? <>{citation.interviewTitle} &middot; {citation.sectionTitle}</>
                                : <>{citation.speaker} &middot; {citation.sectionTitle}</>
                              }
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                              {formatTime(citation.startTime)}–{formatTime(citation.endTime)}
                            </Typography>
                          </Box>
                          <Typography
                            variant="body2"
                            color="text.primary"
                            sx={{
                              mt: 0.5,
                              lineHeight: 1.5,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}>
                            &ldquo;{citation.transcription}&rdquo;
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })
                ) : (
                  // Recording-grouped view
                  groupByRecording(filteredSourcesCitations).map((group) => {
                    const playbackId = getMuxPlaybackId(group.videoUrl);
                    const thumbnailUrl = playbackId && !group.isAudioFile
                      ? `https://image.mux.com/${playbackId}/thumbnail.jpg?width=320&height=180&fit_mode=crop`
                      : null;
                    const isCollapsed = collapsed.has(group.theirstoryId);

                    return (
                      <Box key={group.theirstoryId} sx={{ borderBottom: '2px solid', borderColor: 'divider' }}>
                        <Box
                          onClick={() => toggleCollapse(group.theirstoryId)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            px: 2,
                            py: 1.5,
                            bgcolor: colors.grey[50],
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                            cursor: 'pointer',
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            '&:hover': { bgcolor: colors.grey[100] },
                          }}>
                          <ExpandMoreIcon
                            sx={{
                              fontSize: 20,
                              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s',
                              flexShrink: 0,
                            }}
                          />
                          {thumbnailUrl ? (
                            <Box
                              component="img"
                              src={thumbnailUrl}
                              alt={group.interviewTitle}
                              sx={{ width: 48, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 1, bgcolor: colors.grey[200], flexShrink: 0 }}
                            />
                          ) : (
                            <Box sx={{ width: 48, aspectRatio: '16/9', bgcolor: colors.grey[200], borderRadius: 1, flexShrink: 0 }} />
                          )}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3, fontSize: '0.8rem' }}>
                              {highlightSearchText(group.interviewTitle, sourcesFilterTerm)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {group.results.length} source{group.results.length !== 1 ? 's' : ''}
                            </Typography>
                          </Box>
                        </Box>

                        {!isCollapsed && group.results.map((citation, idx) => (
                          <Box
                            key={`${citation.startTime}-${idx}`}
                            onClick={() => handleCitationClick(citation)}
                            sx={{
                              pl: 2,
                              pr: 2,
                              py: 1.25,
                              cursor: 'pointer',
                              borderLeft: `3px solid ${citation.isChapterSynopsis ? colors.success.main : colors.primary.main}`,
                              '&:hover': { bgcolor: colors.grey[50] },
                              transition: 'background-color 0.15s',
                            }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Box
                                sx={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  bgcolor: citation.isChapterSynopsis ? colors.success.main : colors.primary.main,
                                  color: colors.primary.contrastText,
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  borderRadius: '4px',
                                  px: 0.5,
                                  minWidth: 18,
                                  lineHeight: 1.4,
                                }}>
                                {citation.index}
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {citation.isChapterSynopsis ? 'Chapter Summary' : citation.speaker}
                                {' · '}
                                {citation.sectionTitle}
                                {' · '}
                                {formatTime(citation.startTime)}–{formatTime(citation.endTime)}
                              </Typography>
                            </Box>
                            <Typography
                              variant="body2"
                              color="text.primary"
                              sx={{
                                mt: 0.5,
                                lineHeight: 1.5,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}>
                              &ldquo;{citation.transcription}&rdquo;
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    );
                  })
                )}
              </Box>
            </Box>
          )}

          {/* ===== CHAT VIEW ===== */}
          {currentView === 'chat' && (
            <>
              <Box
                ref={messagesContainerRef}
                sx={{ flex: 1, overflow: 'auto', minHeight: 0, position: 'relative' }}>
                <TextSelectionPopover containerRef={messagesContainerRef} />
                {isEmpty ? (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      px: 2,
                      py: 4,
                    }}>
                    <Typography
                      variant="body1"
                      fontWeight={600}
                      color="text.primary"
                      sx={{ textAlign: 'center', mb: 2 }}>
                      Ask about the interviews
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
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
                            fontSize: '0.8rem',
                            py: 1.25,
                            px: 2,
                            justifyContent: 'flex-start',
                            textAlign: 'left',
                            bgcolor: colors.background.paper,
                            '&:hover': {
                              borderColor: colors.primary.main,
                              bgcolor: colors.background.subtle,
                            },
                          }}>
                          {q}
                        </Button>
                      ))}
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                                  <KeyboardArrowUpIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  disabled={pairIndex === pairs.length - 1}
                                  onClick={() => navigateToPair(pairIndex + 1)}
                                  sx={{ p: 0, color: colors.text.secondary, '&:hover': { color: colors.primary.main } }}>
                                  <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Box>
                            )}
                            <Box
                              sx={{
                                maxWidth: '85%',
                                px: 1.5,
                                py: 0.75,
                                borderRadius: 2,
                                bgcolor: colors.primary.main,
                                color: colors.primary.contrastText,
                                fontSize: '0.8rem',
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
                              onClick={() => handleViewSources(pair.assistantMsg.citations!)}
                              sx={{
                                textTransform: 'none',
                                fontSize: '0.7rem',
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
                        <Box sx={{ pt: 1 }}>
                          {isStreaming && !pair.assistantMsg.content && streamingStatus ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
                              <Box
                                sx={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: '50%',
                                  border: '2px solid',
                                  borderColor: 'primary.main',
                                  borderTopColor: 'transparent',
                                  animation: 'spin 0.8s linear infinite',
                                  flexShrink: 0,
                                  '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
                                }}
                              />
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
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
                )}
              </Box>

              {/* Input area */}
              <Box
                component="form"
                onSubmit={handleSubmit}
                sx={{
                  display: 'flex',
                  gap: 1,
                  px: 2,
                  py: 1.5,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  bgcolor: colors.background.paper,
                  alignItems: 'flex-end',
                  flexShrink: 0,
                }}>
                <TextField
                  inputRef={inputRef}
                  fullWidth
                  multiline
                  maxRows={4}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question..."
                  variant="outlined"
                  size="small"
                  disabled={isStreaming}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: colors.background.default,
                      borderRadius: 2,
                      fontSize: '0.875rem',
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
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                  }}>
                  <SendIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            </>
          )}
        </Box>
      </Drawer>
    </ChatContextProvider>
  );
};
