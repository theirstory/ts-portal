'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  IconButton,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { colors } from '@/lib/theme';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export type ZoteroSaveModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (researchNote: string) => Promise<void>;
  isSaving: boolean;
  mode: 'interview' | 'selection';
  interviewTitle: string;
  /** Only for selection mode */
  selectedText?: string;
  startTime?: number;
  endTime?: number;
  speaker?: string;
  sectionTitle?: string;
};

export const ZoteroSaveModal = ({
  open,
  onClose,
  onSave,
  isSaving,
  mode,
  interviewTitle,
  selectedText,
  startTime,
  endTime,
  speaker,
  sectionTitle,
}: ZoteroSaveModalProps) => {
  const [researchNote, setResearchNote] = useState('');

  const handleSave = async () => {
    await onSave(researchNote.trim());
    setResearchNote('');
  };

  const handleClose = () => {
    if (!isSaving) {
      setResearchNote('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        Save to Zotero
        <IconButton aria-label="Close" onClick={handleClose} size="small" disabled={isSaving}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        {/* Citation preview */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          {mode === 'interview' ? 'Interview' : 'Transcript excerpt'}
        </Typography>
        <Box
          sx={{
            p: 2,
            borderRadius: 1,
            bgcolor: colors.background.subtle,
            borderLeft: `4px solid ${colors.primary.main}`,
            mb: 2,
          }}>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
            {interviewTitle}
          </Typography>
          {mode === 'selection' && (
            <>
              {startTime !== undefined && endTime !== undefined && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {formatTime(startTime)} &ndash; {formatTime(endTime)}
                  {speaker ? ` \u00b7 ${speaker}` : ''}
                  {sectionTitle ? ` \u00b7 ${sectionTitle}` : ''}
                </Typography>
              )}
              {selectedText && (
                <Typography
                  variant="body2"
                  sx={{
                    fontStyle: 'italic',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                    maxHeight: 120,
                    overflow: 'auto',
                    color: colors.text.secondary,
                  }}>
                  &ldquo;{selectedText}&rdquo;
                </Typography>
              )}
            </>
          )}
        </Box>

        {/* Research note */}
        <TextField
          label="Research note (optional)"
          placeholder="Jot down why this is relevant, connections to other sources, thoughts..."
          multiline
          minRows={3}
          maxRows={6}
          fullWidth
          value={researchNote}
          onChange={(e) => setResearchNote(e.target.value)}
          disabled={isSaving}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isSaving} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={isSaving}
          startIcon={isSaving ? <CircularProgress size={16} /> : undefined}
          sx={{ textTransform: 'none' }}>
          {isSaving ? 'Saving...' : 'Save to Zotero'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
