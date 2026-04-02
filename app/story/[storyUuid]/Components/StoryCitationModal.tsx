'use client';

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Button,
  Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { formatChicagoCitation, ChicagoCitationParams } from '@/app/utils/chicagoCitation';
import { colors } from '@/lib/theme';

interface StoryCitationModalProps {
  open: boolean;
  onClose: () => void;
  citationParams: ChicagoCitationParams | null;
}

export const StoryCitationModal = ({ open, onClose, citationParams }: StoryCitationModalProps) => {
  const [copied, setCopied] = useState(false);

  const citation = citationParams ? formatChicagoCitation(citationParams) : '';

  const handleCopy = useCallback(async () => {
    if (!citation) return;
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [citation]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Citation
        <IconButton aria-label="Close" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
          Chicago style citation for this {citationParams?.isAudio ? 'recording' : 'video'}
        </Typography>
        <Box
          component="blockquote"
          sx={{
            p: 2,
            borderRadius: 1,
            bgcolor: colors.background.subtle,
            borderLeft: `4px solid ${colors.primary.main}`,
            fontFamily: 'serif',
            fontSize: '0.95rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
          {citation || 'No citation available.'}
        </Box>
        <Button
          variant="contained"
          onClick={handleCopy}
          disabled={!citation}
          sx={{ mt: 2 }}
          fullWidth>
          {copied ? 'Copied!' : 'Copy citation'}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
