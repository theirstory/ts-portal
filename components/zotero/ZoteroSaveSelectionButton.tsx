'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconButton, Tooltip, Snackbar, Alert, CircularProgress } from '@mui/material';
import { useZoteroStore } from '@/app/stores/useZoteroStore';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useTranscriptSelection } from '@/app/hooks/useTranscriptSelection';
import { organizationConfig } from '@/config/organizationConfig';
import { ZoteroSaveModal } from './ZoteroSaveModal';
import { ZoteroIcon } from './ZoteroIcon';
import type { InterviewSaveData, NoteSaveData } from '@/lib/zotero/types';

function findSpeakerAndSection(
  transcript: {
    sections: Array<{
      title: string;
      start: number;
      end: number;
      paragraphs: Array<{ speaker: string; start: number; end: number }>;
    }>;
  } | null,
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
  const {
    isAuthenticated,
    isSaving,
    lastSavedItemKey,
    lastSaveError,
    lastSaveSuccess,
    saveInterview,
    saveSelectionNote,
    clearSaveState,
  } = useZoteroStore();
  const storyHubPage = useSemanticSearchStore((state) => state.storyHubPage);
  const transcript = useSemanticSearchStore((state) => state.transcript);
  const { selectedText, startTime, endTime, hasSelection } = useTranscriptSelection();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Cache selection data when modal opens (selection clears when focus moves to the modal)
  const [cachedSelection, setCachedSelection] = useState<{
    selectedText: string;
    startTime: number;
    endTime: number;
    speaker: string;
    sectionTitle: string;
  } | null>(null);

  useEffect(() => {
    if (lastSaveSuccess || lastSaveError) {
      setSnackbarOpen(true);
    }
  }, [lastSaveSuccess, lastSaveError]);

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
    setTimeout(clearSaveState, 300);
  };

  const handleOpenModal = () => {
    // Cache the current selection before the modal steals focus
    const { speaker, sectionTitle } = findSpeakerAndSection(transcript as any, startTime);
    setCachedSelection({ selectedText, startTime, endTime, speaker, sectionTitle });
    setModalOpen(true);
  };

  const handleSave = useCallback(
    async (researchNote: string) => {
      if (!cachedSelection || !storyHubPage?.properties) return;

      const p = storyHubPage.properties;
      const interviewTitle = (p.interview_title as string) || 'Untitled Interview';
      const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
      const pageUrl = baseUrl
        ? `${baseUrl}?start=${Math.floor(cachedSelection.startTime)}&end=${Math.floor(cachedSelection.endTime)}`
        : '';

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
        if (!parentKey) return;
      }

      const noteData: NoteSaveData = {
        parentItemKey: parentKey,
        selectedText: cachedSelection.selectedText,
        startTime: cachedSelection.startTime,
        endTime: cachedSelection.endTime,
        speaker: cachedSelection.speaker,
        sectionTitle: cachedSelection.sectionTitle,
        interviewTitle,
        sourceUrl: pageUrl,
        researchNote: researchNote || undefined,
      };

      await saveSelectionNote(noteData);
      setModalOpen(false);
      setCachedSelection(null);
    },
    [cachedSelection, storyHubPage, lastSavedItemKey, saveInterview, saveSelectionNote],
  );

  const handleCloseModal = () => {
    setModalOpen(false);
    setCachedSelection(null);
  };

  if (!isAuthenticated) return null;

  const interviewTitle = (storyHubPage?.properties?.interview_title as string) || 'Untitled Interview';

  return (
    <>
      <Tooltip title={hasSelection ? 'Save selection to Zotero' : 'Select transcript text to save to Zotero'}>
        <span>
          <IconButton onClick={handleOpenModal} disabled={!hasSelection || isSaving} size="small">
            {isSaving ? <CircularProgress size={18} /> : <ZoteroIcon size={18} />}
          </IconButton>
        </span>
      </Tooltip>
      {cachedSelection && (
        <ZoteroSaveModal
          open={modalOpen}
          onClose={handleCloseModal}
          onSave={handleSave}
          isSaving={isSaving}
          mode="selection"
          interviewTitle={interviewTitle}
          selectedText={cachedSelection.selectedText}
          startTime={cachedSelection.startTime}
          endTime={cachedSelection.endTime}
          speaker={cachedSelection.speaker}
          sectionTitle={cachedSelection.sectionTitle}
        />
      )}
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
