'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Box,
  Typography,
  Tabs,
  Tab,
  List,
  ListItem,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import usePlayerStore from '@/app/stores/usePlayerStore';
import { useTranscriptPanelStore } from '@/app/stores/useTranscriptPanelStore';
import { getNerColor, getNerDisplayName } from '@/config/organizationConfig';
import { searchNerEntitiesAcrossCollection } from '@/lib/weaviate/search';
import { WeaviateGenericObject } from 'weaviate-client';
import { Chunks } from '@/types/weaviate';
import { colors } from '@/lib/theme';
import { Word } from '@/types/transcription';

interface NerEntityModalProps {
  open: boolean;
  onClose: () => void;
  entityText: string;
  entityLabel: string;
  currentStoryUuid?: string;
}

interface EntityOccurrence {
  text: string;
  start_time: number;
  end_time: number;
  context: string;
  highlightedContext?: (string | { highlight: boolean; text: string })[];
  interview_title?: string;
  story_uuid?: string;
}

const formatTime = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const hh = hrs > 0 ? `${hrs}:` : '';
  const mm = hrs > 0 ? mins.toString().padStart(2, '0') : mins.toString();
  const ss = secs.toString().padStart(2, '0');

  return `${hh}${mm}:${ss}`;
};

const getContextAroundTime = (words: Word[], targetStartTime: number, targetEndTime: number, entityText: string) => {
  if (!words || words.length === 0) return { context: '', highlightedContext: null };

  // Find words that overlap with the target time range
  const targetWords = words.filter(
    (word) =>
      (word.start >= targetStartTime && word.start <= targetEndTime) ||
      (word.end >= targetStartTime && word.end <= targetEndTime) ||
      (word.start <= targetStartTime && word.end >= targetEndTime),
  );

  if (targetWords.length === 0) {
    // If no exact match, find the closest word by time
    const closestWord = words.reduce((closest, word) => {
      const targetMidpoint = (targetStartTime + targetEndTime) / 2;
      const wordMidpoint = (word.start + word.end) / 2;
      const closestMidpoint = (closest.start + closest.end) / 2;

      return Math.abs(wordMidpoint - targetMidpoint) < Math.abs(closestMidpoint - targetMidpoint) ? word : closest;
    });

    const targetWordIndex = words.indexOf(closestWord);

    // Get 10 words before and after for context
    const startIndex = Math.max(0, targetWordIndex - 10);
    const endIndex = Math.min(words.length - 1, targetWordIndex + 10);

    const contextWords = words.slice(startIndex, endIndex + 1);
    const contextText = contextWords.map((word) => word.text).join(' ');

    // Create highlighted version
    const entityRegex = new RegExp(`\\b${entityText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const highlightedContext = contextText.split(entityRegex).reduce(
      (acc, part, index, array) => {
        if (index === array.length - 1) {
          return [...acc, part];
        }
        const match = contextText.match(entityRegex)?.[Math.floor(index / 2)];
        return [...acc, part, { highlight: true, text: match || entityText }];
      },
      [] as (string | { highlight: boolean; text: string })[],
    );

    return { context: contextText, highlightedContext };
  }

  // Use the first target word to find context
  const firstTargetWord = targetWords[0];
  const targetWordIndex = words.indexOf(firstTargetWord);

  // Get 10 words before and after for context
  const startIndex = Math.max(0, targetWordIndex - 10);
  const endIndex = Math.min(words.length - 1, targetWordIndex + 10);

  const contextWords = words.slice(startIndex, endIndex + 1);
  const contextText = contextWords.map((word) => word.text).join(' ');

  // Create highlighted version
  const entityRegex = new RegExp(`\\b${entityText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  const highlightedContext = contextText.split(entityRegex).reduce(
    (acc, part, index, array) => {
      if (index === array.length - 1) {
        return [...acc, part];
      }
      const match = contextText.match(entityRegex)?.[Math.floor(index / 2)];
      return [...acc, part, { highlight: true, text: match || entityText }];
    },
    [] as (string | { highlight: boolean; text: string })[],
  );

  return { context: contextText, highlightedContext };
};

export const NerEntityModal: React.FC<NerEntityModalProps> = ({
  open,
  onClose,
  entityText,
  entityLabel,
  currentStoryUuid,
}) => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [collectionOccurrences, setCollectionOccurrences] = useState<WeaviateGenericObject<Chunks>[]>([]);

  const { storyHubPage, setUpdateSelectedNerLabel, selected_ner_labels, allWords } = useSemanticSearchStore();
  const { seekTo } = usePlayerStore();
  const { setTargetScrollTime } = useTranscriptPanelStore();

  const labelColor = useMemo(() => getNerColor(entityLabel), [entityLabel]);
  const labelDisplayName = useMemo(() => getNerDisplayName(entityLabel), [entityLabel]);

  // Get occurrences in current interview
  const currentInterviewOccurrences = useMemo(() => {
    if (!storyHubPage?.properties?.ner_data || !allWords) return [];

    const filteredNerData = storyHubPage.properties.ner_data.filter(
      (ner: any) => ner.text?.toLowerCase() === entityText.toLowerCase() && ner.label === entityLabel,
    );

    // Sort by start_time and remove true duplicates (exact same start_time)
    const sortedNerData = filteredNerData.sort((a: any, b: any) => a.start_time - b.start_time);

    // Remove only exact duplicates (same start_time down to the millisecond)
    const uniqueNerData = sortedNerData.filter(
      (ner: any, index: number, arr: any[]) =>
        index === 0 || Math.abs(ner.start_time - arr[index - 1].start_time) > 0.001,
    );

    return uniqueNerData.map((ner: any) => ({
      text: ner.text,
      start_time: ner.start_time,
      end_time: ner.end_time,
      ...getContextAroundTime(allWords, ner.start_time, ner.end_time, ner.text),
    }));
  }, [allWords, entityLabel, entityText, storyHubPage?.properties.ner_data]);

  // Load collection data when modal opens
  useEffect(() => {
    const loadCollectionOccurrences = async () => {
      setLoading(true);
      try {
        const searchResult = await searchNerEntitiesAcrossCollection(entityText, entityLabel, currentStoryUuid);
        setCollectionOccurrences(searchResult.objects);
      } catch (error) {
        console.error('Error loading collection occurrences:', error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadCollectionOccurrences();
    }
  }, [open, entityText, entityLabel, currentStoryUuid]);

  const createSimpleContext = (
    transcription: string,
    entityText: string,
    window: number = 40,
  ): (string | { highlight: boolean; text: string })[] | null => {
    const safeText = entityText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(.{0,${window}})(${safeText})(.{0,${window}})`, 'i');
    const match = transcription.match(regex);

    if (!match) return null;

    const [, before, matchText, after] = match;

    const result: (string | { highlight: boolean; text: string })[] = [];

    if (before.length === window) result.push('...');

    result.push(before);
    result.push({ highlight: true, text: matchText });
    result.push(after);

    if (after.length === window) result.push('...');

    return result;
  };

  const handleCurrentInterviewClick = (occurrence: EntityOccurrence) => {
    // Ensure the NER filter is enabled (don't toggle if already on)
    if (!selected_ner_labels.includes(entityLabel as any)) {
      setUpdateSelectedNerLabel(entityLabel as any);
    }

    seekTo(occurrence.start_time);
    setTargetScrollTime(occurrence.start_time);

    onClose();
  };

  const handleCollectionClick = (occurrence: WeaviateGenericObject<Chunks>) => {
    if (occurrence.uuid) {
      const url = `/story/${occurrence.properties.theirstory_id}?start=${occurrence.properties.start_time}&nerLabel=${entityLabel}`;
      window.open(url, '_blank');
      onClose();
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          maxHeight: '80vh',
        },
      }}>
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <Typography variant="h6" component="div">
          <span
            style={{
              backgroundColor: labelColor,
              color: colors.text.primary,
              fontWeight: 'bold',
              padding: '4px 8px',
              borderRadius: '4px',
              marginRight: '8px',
            }}>
            {labelDisplayName}
          </span>
          {entityText}
        </Typography>

        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
          }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="entity occurrences tabs"
            sx={{ paddingLeft: 2 }}>
            <Tab label={`In the interview (${currentInterviewOccurrences.length})`} sx={{ textTransform: 'none' }} />
            <Tab
              label={`In the project${collectionOccurrences.length > 0 ? ` (${collectionOccurrences.length})` : ''}`}
              sx={{ textTransform: 'none' }}
            />
          </Tabs>
        </Box>

        {tabValue === 0 && (
          <Box sx={{ p: 2 }}>
            {currentInterviewOccurrences.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No occurrences found in this interview
              </Typography>
            ) : (
              <List sx={{ p: 0 }}>
                {currentInterviewOccurrences.map((occurrence: EntityOccurrence, index: number) => (
                  <ListItem
                    key={index}
                    onClick={() => handleCurrentInterviewClick(occurrence)}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: 1,
                      mb: 1,
                      '&:hover': { backgroundColor: 'action.hover' },
                      border: '1px solid',
                      borderColor: 'divider',
                    }}>
                    <Box sx={{ width: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          {formatTime(occurrence.start_time)}
                        </Typography>
                      </Box>

                      <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                        {occurrence.highlightedContext
                          ? occurrence.highlightedContext.map((part: any, idx: number) =>
                              typeof part === 'string' ? (
                                <span key={idx}>{part}</span>
                              ) : (
                                <span
                                  key={idx}
                                  style={{
                                    backgroundColor: colors.warning.main,
                                    fontWeight: 'bold',
                                    padding: '1px 2px',
                                    borderRadius: '2px',
                                  }}>
                                  {part.text}
                                </span>
                              ),
                            )
                          : occurrence.context}
                      </Typography>
                    </Box>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}

        {tabValue === 1 && (
          <Box sx={{ p: 2 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : collectionOccurrences.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No occurrences found in other interviews
              </Typography>
            ) : (
              <List sx={{ p: 0 }}>
                {collectionOccurrences.map((occurrence, index) => {
                  const transcription = occurrence.properties.transcription || '';
                  const highlightedContext = createSimpleContext(transcription, entityText);

                  return (
                    <ListItem
                      key={index}
                      onClick={() => handleCollectionClick(occurrence)}
                      sx={{
                        cursor: 'pointer',
                        borderRadius: 1,
                        mb: 1,
                        '&:hover': { backgroundColor: 'action.hover' },
                        border: '1px solid',
                        borderColor: 'divider',
                      }}>
                      <Box sx={{ width: '100%' }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            mb: 1,
                          }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2" color="primary">
                              {occurrence.properties.interview_title}
                            </Typography>
                            <OpenInNewIcon fontSize="small" color="action" />
                          </Box>

                          <Typography variant="body2" color="text.secondary">
                            {formatTime(occurrence.properties.start_time)}
                          </Typography>
                        </Box>

                        <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                          {highlightedContext
                            ? highlightedContext.map((part, idx) =>
                                typeof part === 'string' ? (
                                  <span key={idx}>{part}</span>
                                ) : (
                                  <span
                                    key={idx}
                                    style={{
                                      backgroundColor: colors.warning.main,
                                      fontWeight: 'bold',
                                      padding: '1px 2px',
                                      borderRadius: '2px',
                                    }}>
                                    {part.text}
                                  </span>
                                ),
                              )
                            : transcription}
                        </Typography>
                      </Box>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};
