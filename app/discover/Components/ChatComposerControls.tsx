'use client';

import React, { useMemo, useState, type MouseEvent } from 'react';
import { Box, IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import MicNoneIcon from '@mui/icons-material/MicNone';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import { colors } from '@/lib/theme';

export const CHAT_LANGUAGES = [
  'English',
  'Español',
  'Français',
  'Deutsch',
  'Português',
  'Italiano',
  'Nederlands',
  'Русский',
] as const;

export type ChatLanguage = (typeof CHAT_LANGUAGES)[number];

const LANGUAGE_LABELS: Record<ChatLanguage, string> = {
  English: 'en',
  Español: 'es-419',
  Français: 'fr',
  Deutsch: 'de',
  Português: 'pt',
  Italiano: 'it',
  Nederlands: 'nl',
  Русский: 'ru',
};

const LANGUAGE_BADGES: Record<ChatLanguage, string> = {
  English: 'EN',
  Español: 'ES',
  Français: 'FR',
  Deutsch: 'DE',
  Português: 'PT',
  Italiano: 'IT',
  Nederlands: 'NL',
  Русский: 'RU',
};

const RECORDING_BARS = [0.72, 0.92, 0.8, 0.62, 0.74, 0.58, 0.68, 0.52, 0.7, 0.48, 0.34, 0.22, 0.28, 0.4, 0.26, 0.2, 0.16, 0.34, 0.22, 0.14, 0.1, 0.08, 0.12, 0.09, 0.08, 0.09, 0.08, 0.09, 0.08, 0.09, 0.08, 0.28, 0.4, 0.22, 0.1, 0.08, 0.12, 0.08, 0.09, 0.08, 0.09, 0.08, 0.09, 0.08, 0.09, 0.08];

export function getSpeechRecognitionLanguage(language: string): string {
  return LANGUAGE_LABELS[language as ChatLanguage] ?? 'en';
}

function getUtilityButtonStyles(compact: boolean) {
  return {
    color: colors.grey[500],
    bgcolor: colors.grey[100],
    width: compact ? 36 : 40,
    height: compact ? 36 : 40,
    borderRadius: '50%',
    '&:hover': {
      bgcolor: colors.grey[200],
    },
    '&.Mui-disabled': {
      color: colors.grey[400],
      bgcolor: colors.grey[100],
    },
  } as const;
}

type LanguageSelectorProps = {
  selectedLanguage: string;
  onLanguageChange: (language: ChatLanguage) => void;
  compact?: boolean;
};

export function LanguageSelector({ selectedLanguage, onLanguageChange, compact = false }: LanguageSelectorProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title={`Language: ${getSpeechRecognitionLanguage(selectedLanguage)}`}>
        <IconButton
          id={compact ? 'chat-language-button-compact' : 'chat-language-button'}
          onClick={handleOpen}
          sx={{
            ...getUtilityButtonStyles(compact),
            position: 'relative',
            overflow: 'visible',
          }}>
          <LanguageIcon sx={{ fontSize: compact ? 20 : 22 }} />
          <Box
            component="span"
            sx={{
              position: 'absolute',
              right: compact ? -2 : -3,
              bottom: compact ? -2 : -3,
              minWidth: compact ? 16 : 18,
              height: compact ? 16 : 18,
              px: 0.4,
              borderRadius: 999,
              bgcolor: colors.primary.main,
              color: colors.primary.contrastText,
              fontSize: compact ? '0.5rem' : '0.55rem',
              fontWeight: 700,
              lineHeight: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 1px 3px ${colors.common.shadow}`,
              border: `1px solid ${colors.background.paper}`,
            }}>
            {LANGUAGE_BADGES[selectedLanguage as ChatLanguage] ?? 'EN'}
          </Box>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 220,
              borderRadius: 3,
              boxShadow: `0 12px 32px ${colors.common.shadow}`,
            },
          },
        }}>
        {CHAT_LANGUAGES.map((language) => (
          <MenuItem
            key={language}
            selected={language === selectedLanguage}
            onClick={() => {
              onLanguageChange(language);
              handleClose();
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: compact ? '0.95rem' : '1rem',
              py: 1.2,
            }}>
            <span>{language}</span>
            {language === selectedLanguage ? (
              <CheckIcon sx={{ fontSize: 18, color: colors.primary.main, ml: 2 }} />
            ) : null}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

type VoiceInputButtonProps = {
  compact?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  isRecording: boolean;
  isSupported: boolean;
  onClick: () => void;
};

export function VoiceInputButton({
  compact = false,
  disabled = false,
  disabledReason,
  isRecording,
  isSupported,
  onClick,
}: VoiceInputButtonProps) {
  const tooltip = disabledReason || (!isSupported ? 'Voice input is not supported in this browser' : 'Voice input');

  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton
          id={compact ? 'chat-voice-button-compact' : 'chat-voice-button'}
          onClick={onClick}
          disabled={disabled}
          sx={{
            ...getUtilityButtonStyles(compact),
            color: isRecording ? colors.primary.main : colors.grey[500],
          }}>
          <MicNoneIcon sx={{ fontSize: compact ? 18 : 20 }} />
        </IconButton>
      </span>
    </Tooltip>
  );
}

type VoiceRecordingComposerProps = {
  audioLevels?: number[];
  compact?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function VoiceRecordingComposer({
  audioLevels,
  compact = false,
  onCancel,
  onConfirm,
}: VoiceRecordingComposerProps) {
  const bars = useMemo(() => {
    if (!audioLevels || audioLevels.length === 0) return RECORDING_BARS;
    return audioLevels;
  }, [audioLevels]);
  const trackHeight = compact ? 48 : 56;
  const trackPaddingX = compact ? 1.5 : 2;
  const barWidth = compact ? 3 : 3.5;
  const barMaxHeight = compact ? 36 : 32;
  const cancelButtonSize = compact ? 38 : 40;
  const confirmButtonSize = compact ? 42 : 44;
  const iconSize = compact ? 24 : 26;

  return (
    <Box
      id={compact ? 'chat-voice-recording-compact' : 'chat-voice-recording'}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 0.75 : 1,
        width: '100%',
        py: compact ? 0.75 : 0.5,
      }}>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          height: trackHeight,
          px: trackPaddingX,
          display: 'flex',
          alignItems: 'center',
          gap: compact ? 0.4 : 0.45,
          borderRadius: 999,
          bgcolor: colors.background.paper,
          boxShadow: `0 1px 3px ${colors.common.shadow}`,
          overflow: 'hidden',
        }}>
        {bars.map((barLevel, index) => (
          <Box
            key={`${barLevel}-${index}`}
            sx={{
              width: barWidth,
              height: `${Math.max(6, Math.round(barLevel * barMaxHeight))}px`,
              maxHeight: '70%',
              minHeight: 2,
              borderRadius: 999,
              bgcolor: barLevel > 0.32 ? colors.grey[600] : colors.grey[300],
              opacity: Math.max(0.35, Math.min(1, barLevel + 0.2)),
              transition: 'height 70ms linear, opacity 70ms linear, background-color 70ms linear',
            }}
          />
        ))}
      </Box>

      <IconButton
        id={compact ? 'chat-voice-cancel-compact' : 'chat-voice-cancel'}
        onClick={onCancel}
        sx={{
          color: colors.grey[600],
          width: cancelButtonSize,
          height: cancelButtonSize,
        }}>
        <CloseIcon sx={{ fontSize: iconSize }} />
      </IconButton>

      <IconButton
        id={compact ? 'chat-voice-confirm-compact' : 'chat-voice-confirm'}
        onClick={onConfirm}
        sx={{
          width: confirmButtonSize,
          height: confirmButtonSize,
          bgcolor: colors.primary.main,
          color: colors.primary.contrastText,
          '&:hover': {
            bgcolor: colors.primary.dark,
          },
        }}>
        <CheckIcon sx={{ fontSize: iconSize }} />
      </IconButton>
    </Box>
  );
}
