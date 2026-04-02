'use client';

import type React from 'react';
import {
  Box,
  CircularProgress,
  InputAdornment,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import SearchIcon from '@mui/icons-material/Search';
import { colors } from '@/lib/theme';
import { SearchMode } from './transcriptTypes';

type TranscriptSearchBarProps = {
  placeholder: string;
  searchTerm: string;
  searchMode: SearchMode | null;
  pickerOpen: boolean;
  thematicLoading: boolean;
  hasResults: boolean;
  isThematic: boolean;
  thematicSearched: boolean;
  totalMatches: number;
  currentMatchIndex: number;
  showMatchNavigation: boolean;
  onSearchTermChange: (value: string) => void;
  onSearchModeChange: (mode: SearchMode) => void;
  onPickerOpenChange: (open: boolean) => void;
  onSearchKeyDown: (e: React.KeyboardEvent) => void;
  onClearSearch: () => void;
  onPrevMatch: () => void;
  onNextMatch: () => void;
};

export function TranscriptSearchBar({
  placeholder,
  searchTerm,
  searchMode,
  pickerOpen,
  thematicLoading,
  hasResults,
  isThematic,
  thematicSearched,
  totalMatches,
  currentMatchIndex,
  showMatchNavigation,
  onSearchTermChange,
  onSearchModeChange,
  onPickerOpenChange,
  onSearchKeyDown,
  onClearSearch,
  onPrevMatch,
  onNextMatch,
}: TranscriptSearchBarProps) {
  return (
    <Box sx={{ flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75 }}>
        <TextField
          size="small"
          fullWidth
          placeholder={placeholder}
          value={searchTerm}
          sx={{
            bgcolor: colors.background.default,
            borderRadius: '8px',
            '& .MuiInputBase-input': {
              fontSize: {
                xs: '16px',
                md: '12px',
              },
            },
          }}
          onChange={(e) => onSearchTermChange(e.target.value)}
          onKeyDown={onSearchKeyDown}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0 }}>
                {pickerOpen ? (
                  <ToggleButtonGroup
                    value={searchMode}
                    exclusive
                    onChange={(_, value) => {
                      if (value) {
                        onSearchModeChange(value);
                        onPickerOpenChange(false);
                      }
                    }}
                    size="small"
                    sx={{ height: { xs: 32, md: 26 }, mr: 0.5 }}>
                    <ToggleButton
                      value="text"
                      sx={{
                        textTransform: 'none',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        px: 1,
                        py: 0,
                        border: 'none',
                        borderRadius: '4px !important',
                        '&.Mui-selected': {
                          bgcolor: colors.grey[200],
                          color: colors.text.primary,
                          '&:hover': { bgcolor: colors.grey[300] },
                        },
                      }}>
                      Keyword
                    </ToggleButton>
                    <ToggleButton
                      value="thematic"
                      sx={{
                        textTransform: 'none',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        px: 1,
                        py: 0,
                        border: 'none',
                        borderRadius: '4px !important',
                        '&.Mui-selected': {
                          bgcolor: colors.grey[200],
                          color: colors.text.primary,
                          '&:hover': { bgcolor: colors.grey[300] },
                        },
                      }}>
                      Thematic
                    </ToggleButton>
                  </ToggleButtonGroup>
                ) : (
                  <Box
                    onClick={() => onPickerOpenChange(true)}
                    sx={{
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      px: 1,
                      mr: 0.5,
                      borderRadius: '4px',
                      bgcolor: colors.grey[200],
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: colors.text.primary,
                      '&:hover': { bgcolor: colors.grey[300] },
                    }}>
                    {searchMode === 'text' ? 'Keyword' : 'Thematic'}
                  </Box>
                )}
                <Box sx={{ width: '1px', height: 20, bgcolor: colors.grey[300], mr: 0.75 }} />
                {thematicLoading ? (
                  <CircularProgress size={16} />
                ) : (
                  <SearchIcon fontSize="small" sx={{ color: colors.text.secondary }} />
                )}
              </InputAdornment>
            ),
            endAdornment: searchTerm.trim() ? (
              <InputAdornment position="end">
                {hasResults ? (
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', mr: 0.5 }}>
                    {currentMatchIndex + 1}/{totalMatches}
                  </Typography>
                ) : searchMode === 'text' ? (
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', mr: 0.5 }}>
                    No matches
                  </Typography>
                ) : isThematic && !thematicLoading && searchTerm.trim() ? (
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', mr: 0.5 }}>
                    {thematicSearched ? 'No matches' : 'Press Enter'}
                  </Typography>
                ) : null}
                <CloseIcon
                  fontSize="small"
                  onClick={onClearSearch}
                  sx={{
                    cursor: 'pointer',
                    color: colors.text.secondary,
                    fontSize: 18,
                    '&:hover': { color: colors.text.primary },
                  }}
                />
              </InputAdornment>
            ) : null,
          }}
        />

        {showMatchNavigation && (
          <>
            <Box
              component="button"
              onClick={onPrevMatch}
              sx={{
                border: 'none',
                bgcolor: 'transparent',
                cursor: 'pointer',
                width: 32,
                height: 32,
                p: 0,
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                alignSelf: 'center',
                lineHeight: 0,
                '&:hover': { bgcolor: colors.grey[100] },
              }}>
              <KeyboardArrowUpIcon fontSize="small" />
            </Box>
            <Box
              component="button"
              onClick={onNextMatch}
              sx={{
                border: 'none',
                bgcolor: 'transparent',
                cursor: 'pointer',
                width: 32,
                height: 32,
                p: 0,
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                alignSelf: 'center',
                lineHeight: 0,
                '&:hover': { bgcolor: colors.grey[100] },
              }}>
              <KeyboardArrowDownIcon fontSize="small" />
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
