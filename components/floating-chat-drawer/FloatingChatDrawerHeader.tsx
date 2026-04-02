'use client';

import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { colors } from '@/lib/theme';

type FloatingChatDrawerHeaderProps = {
  isDesktop: boolean;
  isMobile: boolean;
  shortcutLabel: string;
  hasMessages: boolean;
  onClear: () => void;
  onOpenFullChat: () => void;
  onClose: () => void;
};

export function FloatingChatDrawerHeader({
  isDesktop,
  isMobile,
  shortcutLabel,
  hasMessages,
  onClear,
  onOpenFullChat,
  onClose,
}: FloatingChatDrawerHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: isDesktop ? colors.grey[900] : colors.primary.main,
        color: colors.primary.contrastText,
        flexShrink: 0,
      }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeIcon sx={{ fontSize: 20 }} />
        <Typography variant="subtitle2" fontWeight={700}>
          Discover - Ask AI
        </Typography>
        {isDesktop && (
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            {shortcutLabel}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {hasMessages && (
          <Tooltip title="Clear conversation">
            <IconButton size="small" onClick={onClear} sx={{ color: colors.primary.contrastText }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {!isMobile && (
          <Tooltip title="Open full chat">
            <IconButton size="small" onClick={onOpenFullChat} sx={{ color: colors.primary.contrastText }}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <IconButton size="small" onClick={onClose} sx={{ color: colors.primary.contrastText }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}
