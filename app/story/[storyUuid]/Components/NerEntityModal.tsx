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
  Collapse,
  CircularProgress,
  Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { getNerColor, getNerDisplayName } from '@/config/organizationConfig';
import {
  searchNerEntitiesAcrossCollection,
  getNerEntityRecordingCounts,
} from '@/lib/weaviate/search';
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

type ChunkProps = Partial<Chunks>;

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
  const [projectMentionCount, setProjectMentionCount] = useState<number | null>(null);
  const [projectRecordingCount, setProjectRecordingCount] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
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

  // Load collection data, total mention count, and recording count when modal opens
  // Use high limit so "In the project" reflects most matches available in one query (Weaviate max 10k per query)
  useEffect(() => {
    if (!open) return;
    setProjectRecordingCount(null);
    setProjectMentionCount(null);
    setLoading(true);
    searchNerEntitiesAcrossCollection(entityText, entityLabel, currentStoryUuid, 10_000)
      .then((searchResult) => {
        const objects = searchResult.objects;
        const recordingIds = new Set<string>();
        for (const obj of objects) {
          const id = (obj.properties as ChunkProps)?.theirstory_id;
          if (id) recordingIds.add(String(id));
        }
        setCollectionOccurrences(objects);
        setProjectMentionCount(objects.length);
        setProjectRecordingCount(recordingIds.size);
      })
      .catch((error) => {
        console.error('Error loading collection occurrences:', error);
      })
      .finally(() => {
        setLoading(false);
      });
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

  // Group project occurrences by recording (theirstory_id) for clearer display
  const occurrencesByRecording = useMemo(() => {
    const byId = new Map<
      string,
      { interview_title: string; theirstory_id: string; occurrences: WeaviateGenericObject<Chunks>[] }
    >();
    for (const obj of collectionOccurrences) {
      const props = obj.properties as ChunkProps;
      const id = props?.theirstory_id ?? '';
      const title = props?.interview_title ?? 'Unknown recording';
      if (!byId.has(id)) {
        byId.set(id, { interview_title: title, theirstory_id: id, occurrences: [] });
      }
      byId.get(id)!.occurrences.push(obj);
    }
    return Array.from(byId.values());
  }, [collectionOccurrences]);

  // When modal opens or entity/data changes, expand all recording sections by default
  useEffect(() => {
    if (open && occurrencesByRecording.length > 0) {
      setExpandedSections(new Set(occurrencesByRecording.map((g) => g.theirstory_id)));
    }
  }, [open, entityText, entityLabel, occurrencesByRecording]);

  const toggleSection = (theirstoryId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(theirstoryId)) next.delete(theirstoryId);
      else next.add(theirstoryId);
      return next;
    });
  };

  const recordingCount = projectRecordingCount ?? occurrencesByRecording.length;
  const mentionCount = projectMentionCount ?? collectionOccurrences.length;
  const mentionCountDisplay = mentionCount >= 10_000 ? '10,000+' : String(mentionCount);
  const projectTabLabel =
    mentionCount > 0 || collectionOccurrences.length > 0
      ? `In the project (${mentionCountDisplay} mention${mentionCount !== 1 ? 's' : ''} in ${recordingCount} recording${recordingCount !== 1 ? 's' : ''})`
      : 'In the project';

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
            <Tab label={projectTabLabel} sx={{ textTransform: 'none' }} />
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
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {mentionCountDisplay} mention{mentionCount !== 1 ? 's' : ''} across {recordingCount} recording
                  {recordingCount !== 1 ? 's' : ''}
                </Typography>
                <List sx={{ p: 0 }}>
                  {occurrencesByRecording.map((group) => {
                    const isExpanded = expandedSections.has(group.theirstory_id);
                    return (
                      <Box key={group.theirstory_id} sx={{ mb: 2 }}>
                        <Box
                          component="button"
                          onClick={() => toggleSection(group.theirstory_id)}
                          sx={{
                            width: '100%',
                            lineHeight: 1.5,
                            py: 1.5,
                            px: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 1,
                            backgroundColor: 'background.paper',
                            border: 'none',
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            cursor: 'pointer',
                            textAlign: 'left',
                            position: 'sticky',
                            top: 0,
                            zIndex: 1,
                            boxShadow: (theme) => theme.shadows[1],
                            '&:hover': { backgroundColor: 'action.hover' },
                          }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0 }}>
                            <Box
                              component="span"
                              sx={{ p: 0.25, display: 'inline-flex', alignItems: 'center' }}
                              aria-hidden="true">
                              {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </Box>
                            <Typography variant="subtitle1" fontWeight="600" color="primary" noWrap>
                              {group.interview_title}
                            </Typography>
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {group.occurrences.length} mention{group.occurrences.length !== 1 ? 's' : ''}
                          </Typography>
                        </Box>
                        <Collapse in={isExpanded} timeout="auto">
                          {group.occurrences.map((occurrence, index) => {
                            const transcription = occurrence.properties.transcription || '';
                            const collapsedContext = createSimpleContext(
                              transcription,
                              entityText,
                              COLLAPSED_CHAR_WINDOW,
                            );
                            const expandedContext = createSimpleContext(
                              transcription,
                              entityText,
                              EXPANDED_CHAR_WINDOW,
                            );

                            return (
                              <ListItem
                                key={`${occurrence.uuid ?? occurrence.properties.theirstory_id}-${occurrence.properties.start_time}-${index}`}
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
                                      justifyContent: 'flex-end',
                                      mb: 1,
                                    }}>
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
                        </Collapse>
                      </Box>
                    );
                  })}
                </List>
              </>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};
