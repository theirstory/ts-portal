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
  Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { getNerColor, getNerDisplayName } from '@/config/organizationConfig';
import { searchNerEntitiesAcrossCollection } from '@/lib/weaviate/search';
import { WeaviateGenericObject } from 'weaviate-client';
import { Chunks } from '@/types/weaviate';
import { colors } from '@/lib/theme';
import { Word } from '@/types/transcription';
import { useTranscriptNavigation } from '@/app/hooks/useTranscriptNavigation';
import { formatTime } from '@/app/utils/util';

type HighlightPart = string | { highlight: true; text: string };

interface NerDataItem {
  text: string;
  label: string;
  start_time: number;
  end_time: number;
}

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
  expandedContext: string;
  highlightedContext: HighlightPart[];
  expandedHighlightedContext: HighlightPart[];
  interview_title?: string;
  story_uuid?: string;
}

interface ExpandableHighlightedTextProps {
  collapsedText?: string;
  expandedText?: string;
  collapsedHighlightedParts?: HighlightPart[] | null;
  expandedHighlightedParts?: HighlightPart[] | null;
  collapsedLines?: number;
}

const COLLAPSED_WORD_WINDOW = 10;
const EXPANDED_WORD_WINDOW = 50;
const COLLAPSED_CHAR_WINDOW = 40;
const EXPANDED_CHAR_WINDOW = 200;
const DUPLICATE_TIME_EPSILON = 0.001;

const normalizeNerData = (nerData: unknown[]): NerDataItem[] =>
  nerData.filter(
    (item): item is NerDataItem =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as NerDataItem).text === 'string' &&
      typeof (item as NerDataItem).label === 'string' &&
      typeof (item as NerDataItem).start_time === 'number' &&
      typeof (item as NerDataItem).end_time === 'number',
  );

const ExpandableHighlightedText: React.FC<ExpandableHighlightedTextProps> = ({
  collapsedText = '',
  expandedText,
  collapsedHighlightedParts,
  expandedHighlightedParts,
  collapsedLines = 3,
}) => {
  const [expanded, setExpanded] = useState(false);

  const collapsedPlainText = useMemo(() => {
    if (collapsedHighlightedParts && collapsedHighlightedParts.length > 0) {
      return collapsedHighlightedParts.map((part) => (typeof part === 'string' ? part : part.text)).join('');
    }
    return collapsedText;
  }, [collapsedHighlightedParts, collapsedText]);

  const expandedPlainText = useMemo(() => {
    if (expandedHighlightedParts && expandedHighlightedParts.length > 0) {
      return expandedHighlightedParts.map((part) => (typeof part === 'string' ? part : part.text)).join('');
    }
    return expandedText || collapsedText;
  }, [expandedHighlightedParts, expandedText, collapsedText]);

  const showExpand =
    expandedPlainText.trim().length > collapsedPlainText.trim().length || collapsedPlainText.includes('...');

  const partsToRender = expanded
    ? expandedHighlightedParts || [expandedText || collapsedText]
    : collapsedHighlightedParts || [collapsedText];

  return (
    <Box>
      <Typography
        variant="body2"
        sx={{
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: expanded ? 'unset' : collapsedLines,
          overflow: expanded ? 'visible' : 'hidden',
          textOverflow: 'ellipsis',
        }}>
        {partsToRender.map((part, idx) =>
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
        )}
      </Typography>

      {showExpand && (
        <Button
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            setExpanded((prev) => !prev);
          }}
          sx={{ mt: 0.5, pl: 0, textTransform: 'none' }}>
          {expanded ? 'Expand less' : 'Expand more'}
        </Button>
      )}
    </Box>
  );
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createHighlightedParts = (text: string, entityText: string): HighlightPart[] => {
  const entityRegex = new RegExp(`\\b${escapeRegExp(entityText)}\\b`, 'gi');
  const matches = text.match(entityRegex);
  if (!matches?.length) return [text] as HighlightPart[];

  let matchIndex = 0;
  return text.split(entityRegex).reduce((acc, part, index, array) => {
    if (index === array.length - 1) {
      return [...acc, part];
    }
    const matchText = matches[matchIndex] || entityText;
    matchIndex += 1;
    return [...acc, part, { highlight: true, text: matchText }];
  }, [] as HighlightPart[]);
};

const buildContextWindow = (words: Word[], centerIndex: number, window: number) => {
  const startIndex = Math.max(0, centerIndex - window);
  const endIndex = Math.min(words.length - 1, centerIndex + window);
  const hasLeadingText = startIndex > 0;
  const hasTrailingText = endIndex < words.length - 1;
  return `${hasLeadingText ? '... ' : ''}${words
    .slice(startIndex, endIndex + 1)
    .map((word) => word.text)
    .join(' ')}${hasTrailingText ? ' ...' : ''}`;
};

const getTargetWordIndex = (words: Word[], targetStartTime: number, targetEndTime: number) => {
  const overlappingWords = words.filter(
    (word) =>
      (word.start >= targetStartTime && word.start <= targetEndTime) ||
      (word.end >= targetStartTime && word.end <= targetEndTime) ||
      (word.start <= targetStartTime && word.end >= targetEndTime),
  );

  if (overlappingWords.length > 0) {
    return words.indexOf(overlappingWords[0]);
  }

  const targetMidpoint = (targetStartTime + targetEndTime) / 2;
  const closestWord = words.reduce((closest, word) => {
    const wordMidpoint = (word.start + word.end) / 2;
    const closestMidpoint = (closest.start + closest.end) / 2;
    return Math.abs(wordMidpoint - targetMidpoint) < Math.abs(closestMidpoint - targetMidpoint) ? word : closest;
  });

  return words.indexOf(closestWord);
};

const getContextAroundTime = (
  words: Word[],
  targetStartTime: number,
  targetEndTime: number,
  entityText: string,
): Pick<EntityOccurrence, 'context' | 'expandedContext' | 'highlightedContext' | 'expandedHighlightedContext'> => {
  if (!words || words.length === 0) {
    return {
      context: '',
      expandedContext: '',
      highlightedContext: [],
      expandedHighlightedContext: [],
    };
  }

  const targetWordIndex = getTargetWordIndex(words, targetStartTime, targetEndTime);
  const collapsed = buildContextWindow(words, targetWordIndex, COLLAPSED_WORD_WINDOW);
  const expanded = buildContextWindow(words, targetWordIndex, EXPANDED_WORD_WINDOW);

  return {
    context: collapsed,
    expandedContext: expanded,
    highlightedContext: createHighlightedParts(collapsed, entityText),
    expandedHighlightedContext: createHighlightedParts(expanded, entityText),
  };
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
  const { seekAndScroll } = useTranscriptNavigation();
  const nerLabel = entityLabel as (typeof selected_ner_labels)[number];

  const labelColor = useMemo(() => getNerColor(entityLabel), [entityLabel]);
  const labelDisplayName = useMemo(() => getNerDisplayName(entityLabel), [entityLabel]);

  // Get occurrences in current interview
  const currentInterviewOccurrences = useMemo<EntityOccurrence[]>(() => {
    if (!storyHubPage?.properties?.ner_data || !allWords) return [];

    const filteredNerData = normalizeNerData(storyHubPage.properties.ner_data as unknown[])
      .sort((a, b) => a.start_time - b.start_time)
      .filter((ner) => ner.text.toLowerCase() === entityText.toLowerCase() && ner.label === entityLabel);

    const uniqueNerData = filteredNerData.filter(
      (ner, index, arr) => index === 0 || Math.abs(ner.start_time - arr[index - 1].start_time) > DUPLICATE_TIME_EPSILON,
    );

    return uniqueNerData.map(
      (ner): EntityOccurrence => ({
        text: ner.text,
        start_time: ner.start_time,
        end_time: ner.end_time,
        ...getContextAroundTime(allWords, ner.start_time, ner.end_time, ner.text),
      }),
    );
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
    window: number = COLLAPSED_CHAR_WINDOW,
  ): { text: string; highlightedParts: HighlightPart[] } | null => {
    const source = transcription;
    const sourceLower = source.toLowerCase();
    const entityLower = entityText.toLowerCase();
    const matchStart = sourceLower.indexOf(entityLower);

    if (matchStart === -1) return null;

    const matchEnd = matchStart + entityText.length;
    const start = Math.max(0, matchStart - window);
    const end = Math.min(source.length, matchEnd + window);
    const before = source.slice(start, matchStart);
    const matchText = source.slice(matchStart, matchEnd);
    const after = source.slice(matchEnd, end);
    const hasLeadingText = start > 0;
    const hasTrailingText = end < source.length;

    const highlightedParts: HighlightPart[] = [];
    if (hasLeadingText) highlightedParts.push('...');
    highlightedParts.push(before);
    highlightedParts.push({ highlight: true, text: matchText });
    highlightedParts.push(after);
    if (hasTrailingText) highlightedParts.push('...');

    const text = `${hasLeadingText ? '...' : ''}${before}${matchText}${after}${hasTrailingText ? '...' : ''}`;

    return { text, highlightedParts };
  };

  const handleCurrentInterviewClick = (occurrence: EntityOccurrence) => {
    // Ensure the NER filter is enabled (don't toggle if already on)
    if (!selected_ner_labels.includes(nerLabel)) {
      setUpdateSelectedNerLabel(nerLabel);
    }

    seekAndScroll(occurrence.start_time);

    onClose();
  };

  const handleCollectionClick = (occurrence: WeaviateGenericObject<Chunks>) => {
    if (occurrence.uuid) {
      const url = `/story/${occurrence.properties.theirstory_id}?start=${occurrence.properties.start_time}&end=${occurrence.properties.end_time}&nerLabel=${entityLabel}`;
      window.open(url, '_blank');
      onClose();
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
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
                    key={`${occurrence.start_time}-${occurrence.end_time}-${occurrence.text}-${index}`}
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

                      <ExpandableHighlightedText
                        collapsedText={occurrence.context}
                        expandedText={occurrence.expandedContext}
                        collapsedHighlightedParts={occurrence.highlightedContext}
                        expandedHighlightedParts={occurrence.expandedHighlightedContext}
                        collapsedLines={3}
                      />
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
                  const collapsedContext = createSimpleContext(transcription, entityText, COLLAPSED_CHAR_WINDOW);
                  const expandedContext = createSimpleContext(transcription, entityText, EXPANDED_CHAR_WINDOW);

                  return (
                    <ListItem
                      key={`${occurrence.uuid || occurrence.properties.theirstory_id}-${occurrence.properties.start_time}-${index}`}
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

                        <ExpandableHighlightedText
                          collapsedText={collapsedContext?.text || transcription}
                          expandedText={expandedContext?.text || transcription}
                          collapsedHighlightedParts={collapsedContext?.highlightedParts || null}
                          expandedHighlightedParts={expandedContext?.highlightedParts || null}
                          collapsedLines={3}
                        />
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
