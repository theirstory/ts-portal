'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import CircularProgress from '@mui/material/CircularProgress';

import { colors } from '@/lib/theme';
import type { IndexesApiResponse, IndexesStory, IndexChapter } from '@/app/api/indexes/route';
import { IndexesListView } from '@/components/IndexesListView';
import { IndexesHorizontalView } from '@/components/IndexesHorizontalView';

function filterStories(
  stories: IndexesStory[],
  searchQuery: string,
  selectedCollectionIds: string[],
  chaptersByStoryId: Record<string, { section_title: string; synopsis?: string }[]>,
): IndexesStory[] {
  const q = searchQuery.trim().toLowerCase();
  return stories.filter((story) => {
    if (selectedCollectionIds.length > 0 && !selectedCollectionIds.includes(story.collection_id)) return false;
    if (!q) return true;
    if (story.interview_title.toLowerCase().includes(q)) return true;
    const chapters = chaptersByStoryId[story.uuid] ?? [];
    return chapters.some(
      (ch) => ch.section_title.toLowerCase().includes(q) || (ch.synopsis && ch.synopsis.toLowerCase().includes(q)),
    );
  });
}

export default function IndexesPage() {
  const [viewMode, setViewMode] = useState<'list' | 'horizontal'>('horizontal');
  const [data, setData] = useState<IndexesApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [collectionMenuAnchor, setCollectionMenuAnchor] = useState<null | HTMLElement>(null);
  const [collectionFilterTerm, setCollectionFilterTerm] = useState('');
  const collectionFilterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/indexes')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load indexes');
        return res.json();
      })
      .then((json: IndexesApiResponse) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load indexes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const collectionOptions = useMemo(() => {
    if (!data?.stories.length) return [];
    const seen = new Map<string, { id: string; name: string; description: string }>();
    for (const s of data.stories) {
      if (s.collection_id && !seen.has(s.collection_id)) {
        seen.set(s.collection_id, {
          id: s.collection_id,
          name: s.collection_name || s.collection_id,
          description: s.collection_description ?? '',
        });
      }
    }
    return Array.from(seen.values());
  }, [data?.stories]);

  const recordingsPerCollectionId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of data?.stories ?? []) {
      const id = s.collection_id || '';
      m[id] = (m[id] ?? 0) + 1;
    }
    return m;
  }, [data?.stories]);

  const filteredStories = useMemo(() => {
    if (!data) return [];
    return filterStories(data.stories, searchQuery, selectedCollectionIds, data.chaptersByStoryId);
  }, [data, searchQuery, selectedCollectionIds]);

  const filteredChaptersByStoryId = useMemo((): Record<string, IndexChapter[]> => {
    if (!data?.chaptersByStoryId) return {};
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.chaptersByStoryId;
    const out: Record<string, IndexChapter[]> = {};
    for (const [storyId, chapters] of Object.entries(data.chaptersByStoryId)) {
      out[storyId] = chapters.filter(
        (ch) =>
          ch.section_title.toLowerCase().includes(q) || (ch.synopsis != null && ch.synopsis.toLowerCase().includes(q)),
      );
    }
    return out;
  }, [data?.chaptersByStoryId, searchQuery]);

  const handleCollectionToggle = (id: string) => {
    setSelectedCollectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const filteredCollectionsForDropdown = useMemo(() => {
    const q = collectionFilterTerm.trim().toLowerCase();
    if (!q) return collectionOptions;
    return collectionOptions.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [collectionOptions, collectionFilterTerm]);

  const collectionMenuOpen = Boolean(collectionMenuAnchor);
  useEffect(() => {
    if (collectionMenuOpen) {
      const t = setTimeout(() => collectionFilterInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [collectionMenuOpen]);
  const closeCollectionMenu = () => {
    setCollectionMenuAnchor(null);
    setCollectionFilterTerm('');
  };

  const handleViewChange = (_event: React.MouseEvent<HTMLElement>, newView: 'list' | 'horizontal' | null) => {
    if (newView !== null) setViewMode(newView);
  };

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'row',
        maxWidth: 1600,
        mx: 'auto',
        px: { xs: 2, sm: 3, md: 4 },
        pt: { xs: 1, md: 2 },
        pb: { xs: 2, md: 3 },
        width: '100%',
      }}>
      {/* Left sidebar: search and filters (list view only; horizontal view uses inline filters) */}
      {!loading && data && data.stories.length > 0 && viewMode === 'list' && (
        <Box
          sx={{
            flexShrink: 0,
            width: 320,
            mr: 3,
            display: { xs: 'none', md: 'block' },
          }}>
          <Box
            sx={{
              bgcolor: colors.grey[100],
              borderRadius: 2,
              p: 2,
              position: 'sticky',
              top: 24,
              border: `1px solid ${colors.common.border}`,
              boxShadow: `0 1px 2px ${colors.common.shadow}`,
            }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
              Filters
            </Typography>
            <TextField
              size="small"
              fullWidth
              variant="outlined"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton aria-label="clear search" onClick={() => setSearchQuery('')} size="small">
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{ mb: 2, bgcolor: 'background.paper', borderRadius: '8px' }}
            />
            <Typography variant="subtitle2" fontWeight={600} color="text.primary" sx={{ display: 'block', mb: 0.5 }}>
              Collection
            </Typography>
            <Button
              fullWidth
              size="small"
              onClick={(e) => setCollectionMenuAnchor(e.currentTarget)}
              endIcon={<KeyboardArrowDownIcon />}
              sx={{
                textTransform: 'none',
                justifyContent: 'space-between',
                minHeight: 40,
                pl: 1.5,
                bgcolor: 'background.paper',
                borderRadius: '8px',
                border: `1px solid ${colors.common.border}`,
                color: 'text.primary',
                '&:hover': { bgcolor: colors.grey[100] },
              }}>
              {selectedCollectionIds.length === 0 ? 'All collections' : `${selectedCollectionIds.length} selected`}
            </Button>
            {selectedCollectionIds.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {selectedCollectionIds.map((id) => {
                  const c = collectionOptions.find((x) => x.id === id);
                  return (
                    <Chip
                      key={id}
                      label={c?.name ?? id}
                      size="small"
                      onDelete={() => handleCollectionToggle(id)}
                      sx={{
                        flexShrink: 0,
                        backgroundColor: colors.primary.light,
                        color: colors.primary.contrastText,
                        fontWeight: 500,
                      }}
                    />
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Main content */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
            mb: 2,
            flexShrink: 0,
          }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h4" fontWeight={700}>
              All Indexes
            </Typography>
            {/* Inline filters for horizontal view (desktop): search + collection next to title */}
            {!loading && data && data.stories.length > 0 && viewMode === 'horizontal' && (
              <Box
                sx={{
                  display: { xs: 'none', md: 'flex' },
                  alignItems: 'center',
                  gap: 1.5,
                  flexWrap: 'wrap',
                }}>
                <TextField
                  size="small"
                  variant="outlined"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: searchQuery ? (
                      <InputAdornment position="end">
                        <IconButton aria-label="clear search" onClick={() => setSearchQuery('')} size="small">
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  }}
                  sx={{
                    width: { md: 380, lg: 440 },
                    bgcolor: colors.background.default,
                    borderRadius: '8px',
                  }}
                />
                <Button
                  size="small"
                  onClick={(e) => setCollectionMenuAnchor(e.currentTarget)}
                  endIcon={<KeyboardArrowDownIcon />}
                  sx={{
                    textTransform: 'none',
                    minHeight: 40,
                    pl: 1.5,
                    bgcolor: colors.background.default,
                    borderRadius: '8px',
                    border: `1px solid ${colors.common.border}`,
                    color: 'text.primary',
                    '&:hover': { bgcolor: colors.grey[100] },
                  }}>
                  {selectedCollectionIds.length === 0 ? 'All collections' : `${selectedCollectionIds.length} selected`}
                </Button>
                {selectedCollectionIds.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                    {selectedCollectionIds.map((id) => {
                      const c = collectionOptions.find((x) => x.id === id);
                      return (
                        <Chip
                          key={id}
                          label={c?.name ?? id}
                          size="small"
                          onDelete={() => handleCollectionToggle(id)}
                          sx={{
                            flexShrink: 0,
                            backgroundColor: colors.primary.light,
                            color: colors.primary.contrastText,
                            fontWeight: 500,
                          }}
                        />
                      );
                    })}
                  </Box>
                )}
              </Box>
            )}
          </Box>
          {!loading && data && data.stories.length > 0 && (
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={handleViewChange}
              aria-label="indexes view mode"
              size="small">
              <ToggleButton value="list" aria-label="vertical list view">
                <ViewListIcon />
              </ToggleButton>
              <ToggleButton value="horizontal" aria-label="horizontal scroll view">
                <ViewModuleIcon />
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>

        {/* Mobile: search and collection inline */}
        {!loading && data && data.stories.length > 0 && (
          <Box sx={{ display: { md: 'none' }, mb: 2 }}>
            <TextField
              size="small"
              fullWidth
              variant="outlined"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton aria-label="clear search" onClick={() => setSearchQuery('')} size="small">
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{ mb: 1, bgcolor: colors.background.default, borderRadius: '8px' }}
            />
            <Typography variant="subtitle2" fontWeight={600} color="text.primary" sx={{ display: 'block', mb: 0.5 }}>
              Collection
            </Typography>
            <Button
              fullWidth
              size="small"
              onClick={(e) => setCollectionMenuAnchor(e.currentTarget)}
              endIcon={<KeyboardArrowDownIcon />}
              sx={{
                textTransform: 'none',
                justifyContent: 'space-between',
                minHeight: 40,
                pl: 1.5,
                bgcolor: colors.background.default,
                borderRadius: '8px',
                border: `1px solid ${colors.common.border}`,
                color: 'text.primary',
                '&:hover': { bgcolor: colors.grey[100] },
              }}>
              {selectedCollectionIds.length === 0 ? 'All collections' : `${selectedCollectionIds.length} selected`}
            </Button>
            {selectedCollectionIds.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {selectedCollectionIds.map((id) => {
                  const c = collectionOptions.find((x) => x.id === id);
                  return (
                    <Chip
                      key={id}
                      label={c?.name ?? id}
                      size="small"
                      onDelete={() => handleCollectionToggle(id)}
                      sx={{
                        flexShrink: 0,
                        backgroundColor: colors.primary.light,
                        color: colors.primary.contrastText,
                        fontWeight: 500,
                      }}
                    />
                  );
                })}
              </Box>
            )}
          </Box>
        )}

        {loading && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 6,
              flexShrink: 0,
              alignSelf: 'flex-start',
              width: '100%',
            }}>
            <CircularProgress size={40} />
          </Box>
        )}

        {error && (
          <Typography color="error" sx={{ py: 4, textAlign: 'center', flexShrink: 0 }}>
            {error}
          </Typography>
        )}

        {!loading && !error && data && (
          <>
            {data.stories.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center', flexShrink: 0 }}>
                No indexes available.
              </Typography>
            ) : (
              <>
                {filteredStories.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center', flexShrink: 0 }}>
                    No indexes match your search or filter.
                  </Typography>
                ) : (
                  <Box sx={{ flexShrink: 0, mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Results: 1–{filteredStories.length} of {filteredStories.length}
                    </Typography>
                  </Box>
                )}
                {filteredStories.length > 0 && (
                  <Box
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      overflow: 'auto',
                      pr: 0.5,
                      '&::-webkit-scrollbar': { width: 6, height: 6 },
                      '&::-webkit-scrollbar-track': { backgroundColor: colors.grey[100], borderRadius: 1 },
                      '&::-webkit-scrollbar-thumb': {
                        backgroundColor: colors.grey[400],
                        borderRadius: 1,
                        '&:hover': { backgroundColor: colors.grey[500] },
                      },
                    }}>
                    {viewMode === 'list' ? (
                      <IndexesListView
                        stories={filteredStories}
                        chaptersByStoryId={filteredChaptersByStoryId}
                        searchQuery={searchQuery}
                      />
                    ) : (
                      <IndexesHorizontalView
                        stories={filteredStories}
                        chaptersByStoryId={filteredChaptersByStoryId}
                        searchQuery={searchQuery}
                      />
                    )}
                  </Box>
                )}
              </>
            )}
          </>
        )}
        {/* Shared collection dropdown menu (opened from sidebar, inline, or mobile button) */}
        {!loading && data && data.stories.length > 0 && (
          <Menu
            anchorEl={collectionMenuAnchor}
            open={collectionMenuOpen}
            onClose={closeCollectionMenu}
            disableAutoFocusItem
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ list: { dense: true, disablePadding: true } }}
            sx={{
              mt: 0.5,
              '& .MuiPaper-root': { maxHeight: 360, width: 320 },
            }}>
            <Box sx={{ p: 1.5, borderBottom: `1px solid ${colors.common.border}` }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Filter collections..."
                value={collectionFilterTerm}
                onChange={(e) => setCollectionFilterTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                inputRef={collectionFilterInputRef}
                autoFocus
              />
            </Box>
            <Box sx={{ maxHeight: 280, overflowY: 'auto', py: 0.5 }}>
              {filteredCollectionsForDropdown.map((c) => {
                const checked = selectedCollectionIds.includes(c.id);
                const count = recordingsPerCollectionId[c.id] ?? 0;
                return (
                  <MenuItem key={c.id} onClick={() => handleCollectionToggle(c.id)} sx={{ py: 0.75 }} dense>
                    <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                      {c.name}
                      {count >= 0 && ` (${count} recording${count !== 1 ? 's' : ''})`}
                    </Typography>
                    <Checkbox size="small" checked={checked} sx={{ p: 0.25 }} onClick={(e) => e.stopPropagation()} />
                  </MenuItem>
                );
              })}
              {filteredCollectionsForDropdown.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
                  No collections match.
                </Typography>
              )}
            </Box>
          </Menu>
        )}
      </Box>
    </Box>
  );
}
