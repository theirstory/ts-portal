'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Snackbar, Alert } from '@mui/material';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import CheckIcon from '@mui/icons-material/Check';
import { useZoteroStore } from '@/app/stores/useZoteroStore';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { organizationConfig } from '@/config/organizationConfig';
import { ZoteroSaveModal } from './ZoteroSaveModal';
import type { InterviewSaveData } from '@/lib/zotero/types';

export const ZoteroSaveInterviewButton = () => {
  const { isAuthenticated, isSaving, lastSavedItemKey, lastSaveError, lastSaveSuccess, saveInterview, checkExistingItem, clearSaveState } =
    useZoteroStore();
  const storyHubPage = useSemanticSearchStore((state) => state.storyHubPage);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Check if this interview already exists in the user's Zotero library
  useEffect(() => {
    if (!isAuthenticated || lastSavedItemKey) return;
    const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
    if (pageUrl) checkExistingItem(pageUrl);
  }, [isAuthenticated, lastSavedItemKey, checkExistingItem]);

  useEffect(() => {
    if (lastSaveSuccess || lastSaveError) {
      setSnackbarOpen(true);
    }
  }, [lastSaveSuccess, lastSaveError]);

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
    setTimeout(clearSaveState, 300);
  };

  const handleSave = useCallback(
    async (researchNote: string) => {
      if (!storyHubPage?.properties) return;

      const p = storyHubPage.properties;
      const participants = Array.isArray(p.participants) ? (p.participants as string[]) : [];
      const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';

      const data: InterviewSaveData = {
        title: (p.interview_title as string) || 'Untitled Interview',
        participants,
        recordingDate: (p.recording_date as string) || '',
        isAudio: Boolean(p.isAudioFile),
        url: pageUrl,
        description: (p.interview_description as string) || '',
        archiveName: organizationConfig?.displayName || organizationConfig?.name || '',
        duration: typeof p.interview_duration === 'number' ? (p.interview_duration as number) : 0,
        researchNote: researchNote || undefined,
      };

      await saveInterview(data);
      setModalOpen(false);
    },
    [storyHubPage, saveInterview],
  );

  if (!isAuthenticated) return null;

  const alreadySaved = Boolean(lastSavedItemKey);
  const interviewTitle = (storyHubPage?.properties?.interview_title as string) || 'Untitled Interview';

  return (
    <>
      <Button
        onClick={() => setModalOpen(true)}
        disabled={isSaving || alreadySaved}
        size="small"
        variant="outlined"
        startIcon={alreadySaved ? <CheckIcon fontSize="small" /> : <BookmarkAddIcon fontSize="small" />}
        sx={{ textTransform: 'none', fontSize: '0.8rem' }}>
        {alreadySaved ? 'Saved to Zotero' : 'Save to Zotero'}
      </Button>
      <ZoteroSaveModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        isSaving={isSaving}
        mode="interview"
        interviewTitle={interviewTitle}
      />
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
