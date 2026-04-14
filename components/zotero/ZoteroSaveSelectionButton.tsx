'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconButton, Tooltip, Snackbar, Alert, CircularProgress } from '@mui/material';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import { useZoteroStore } from '@/app/stores/useZoteroStore';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useTranscriptSelection } from '@/app/hooks/useTranscriptSelection';
import { organizationConfig } from '@/config/organizationConfig';
import type { InterviewSaveData, NoteSaveData } from '@/lib/zotero/types';
import { ZoteroIcon } from './ZoteroIcon';

function findSpeakerAndSection(
  transcript: { sections: Array<{ title: string; start: number; end: number; paragraphs: Array<{ speaker: string; start: number; end: number }> }> } | null,
  startTime: number,
): { speaker: string; sectionTitle: string } {
  if (!transcript?.sections) return { speaker: '', sectionTitle: '' };
  for (const section of transcript.sections) {
    if (startTime >= section.start && startTime < section.end) {
      const para = section.paragraphs?.find((p) => startTime >= p.start && startTime < p.end);
      return {
        speaker: para?.speaker || '',
        sectionTitle: section.title || '',
      };
    }
  }
  return { speaker: '', sectionTitle: '' };
}

export const ZoteroSaveSelectionButton = () => {
  const { isAuthenticated, isSaving, lastSavedItemKey, lastSaveError, lastSaveSuccess, saveInterview, saveSelectionNote, clearSaveState } =
    useZoteroStore();
  const storyHubPage = useSemanticSearchStore((state) => state.storyHubPage);
  const transcript = useSemanticSearchStore((state) => state.transcript);
  const { selectedText, startTime, endTime, hasSelection } = useTranscriptSelection();
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  useEffect(() => {
    if (lastSaveSuccess || lastSaveError) {
      setSnackbarOpen(true);
    }
  }, [lastSaveSuccess, lastSaveError]);

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
    setTimeout(clearSaveState, 300);
  };

  const handleSave = useCallback(async () => {
    if (!hasSelection || !storyHubPage?.properties) return;

    const p = storyHubPage.properties;
    const interviewTitle = (p.interview_title as string) || 'Untitled Interview';
    const baseUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : '';
    const pageUrl = baseUrl ? `${baseUrl}?start=${Math.floor(startTime)}&end=${Math.floor(endTime)}` : '';

    // Ensure parent item exists
    let parentKey = lastSavedItemKey;
    if (!parentKey) {
      const participants = Array.isArray(p.participants) ? (p.participants as string[]) : [];
      const interviewData: InterviewSaveData = {
        title: interviewTitle,
        participants,
        recordingDate: (p.recording_date as string) || '',
        isAudio: Boolean(p.isAudioFile),
        url: baseUrl,
        description: (p.interview_description as string) || '',
        archiveName: organizationConfig?.displayName || organizationConfig?.name || '',
        duration: typeof p.interview_duration === 'number' ? (p.interview_duration as number) : 0,
      };
      parentKey = await saveInterview(interviewData);
      if (!parentKey) return; // save failed
    }

    const { speaker, sectionTitle } = findSpeakerAndSection(transcript as any, startTime);

    const noteData: NoteSaveData = {
      parentItemKey: parentKey,
      selectedText,
      startTime,
      endTime,
      speaker,
      sectionTitle,
      interviewTitle,
      sourceUrl: pageUrl,
    };

    await saveSelectionNote(noteData);
  }, [hasSelection, storyHubPage, lastSavedItemKey, transcript, startTime, endTime, selectedText, saveInterview, saveSelectionNote]);

  if (!isAuthenticated) return null;

  return (
    <>
      <Tooltip title={hasSelection ? 'Save selection to Zotero' : 'Select transcript text to save to Zotero'}>
        <span>
          <IconButton
            onClick={handleSave}
            disabled={!hasSelection || isSaving}
            size="small">
            {isSaving ? (
              <CircularProgress size={18} />
            ) : (
              <ZoteroIcon size={18} />
            )}
          </IconButton>
        </span>
      </Tooltip>
      <Snackbar open={snackbarOpen} autoHideDuration={4000} onClose={handleSnackbarClose}>
        <Alert
          onClose={handleSnackbarClose}
          severity={lastSaveError ? 'error' : 'success'}
          variant="filled"
          sx={{ width: '100%' }}>
          {lastSaveError || lastSaveSuccess}
        </Alert>
      </Snackbar>
    </>
  );
};
