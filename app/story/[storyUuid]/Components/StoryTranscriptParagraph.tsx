'use client';

import { Box, Typography } from '@mui/material';
import React, { memo, useEffect, useRef } from 'react';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useSearchStore } from '@/app/stores/useSearchStore';
import usePlayerStore from '@/app/stores/usePlayerStore';
import {
  scrollElementIntoContainer,
  scrollElementIntoContainerCenter,
} from '@/app/utils/scrollElementIntoContainer';
import { useTranscriptPanelStore } from '@/app/stores/useTranscriptPanelStore';
import { StoryTranscriptWord } from './StoryTranscriptWord';
import { StoryTranscriptNERGroupWords } from './StoryTranscriptNERGroupWords';
import { WeaviateGenericObject } from 'weaviate-client';
import { Chunks } from '@/types/weaviate';
import { Paragraph, Word } from '@/types/transcription';
import { colors } from '@/lib/theme';
import { isMobile } from '@/app/utils/util';

type Props = {
  paragraph: Paragraph;
  wordsInParagraph: Word[];
  isProgrammaticScrollRef: React.MutableRefObject<boolean>;
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const getSemanticMatchForWord = (semanticMatches: WeaviateGenericObject<Chunks>[], word: Word) => {
  return semanticMatches.find((match) => {
    const matchStart = match.properties?.start_time;
    const matchEnd = match.properties?.end_time;
    return word.start >= matchStart && word.end <= matchEnd;
  });
};

export const StoryTranscriptParagraph = memo(({ paragraph, wordsInParagraph, isProgrammaticScrollRef }: Props) => {
  const MATCH_EPSILON = 0.001;

  /**
   * store
   */
  const currentSemanticMatchIndex = useSemanticSearchStore((state) => state.currentMatchIndex);
  const semanticSearchMatches = useSemanticSearchStore((state) => state.matches);
  const storyHubPage = useSemanticSearchStore((state) => state.storyHubPage);
  const allWords = useSemanticSearchStore((state) => state.allWords);
  const selected_ner_labels = useSemanticSearchStore((state) => state.selected_ner_labels);
  const traditionalSearchMatches = useSearchStore((state) => state.matches);
  const traditionalCurrentMatchIndex = useSearchStore((state) => state.currentMatchIndex);

  const seekTo = usePlayerStore((state) => state.seekTo);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const isPlaying = usePlayerStore((state) => state.isPlaying);

  const isCurrentTimeOutOfView = useTranscriptPanelStore((state) => state.isCurrentTimeOutOfView);
  const targetScrollTime = useTranscriptPanelStore((state) => state.targetScrollTime);
  const setTargetScrollTime = useTranscriptPanelStore((state) => state.setTargetScrollTime);

  /**
   * refs
   */
  const paragraphRef = useRef<HTMLDivElement>(null);

  /**
   * variables
   */
  const { ner_data = [] } = storyHubPage?.properties ?? {};
  const renderedWordIndexes = new Set<number>();
  const isMobileView = isMobile();
  const transcriptTopOffset = isMobileView ? -44 : -36;

  /**
   * effects
   */
  useEffect(() => {
    if (targetScrollTime === null) return;

    const isTargetParagraph = targetScrollTime >= paragraph.start && targetScrollTime < paragraph.end;

    if (!isTargetParagraph) return;

    const element = paragraphRef.current;
    const scrollContainer = document.getElementById('transcript-panel-content');

    if (!element || !scrollContainer) return;

    isProgrammaticScrollRef.current = true;
    scrollElementIntoContainer(element, scrollContainer, transcriptTopOffset);
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 120);

    setTargetScrollTime(null);
  }, [
    targetScrollTime,
    paragraph.start,
    paragraph.end,
    setTargetScrollTime,
    transcriptTopOffset,
    isProgrammaticScrollRef,
  ]);

  useEffect(() => {
    const scrollContainer = document.getElementById('transcript-panel-content');
    if (!scrollContainer) return;

    if (currentSemanticMatchIndex >= 0 && semanticSearchMatches[currentSemanticMatchIndex]) {
      const currentMatch = semanticSearchMatches[currentSemanticMatchIndex];
      const matchStartTime = currentMatch.properties?.start_time;
      const matchEndTime = currentMatch.properties?.end_time;
      const isMatchOverlappingParagraph =
        matchStartTime !== undefined &&
        matchEndTime !== undefined &&
        matchEndTime >= paragraph.start - MATCH_EPSILON &&
        matchStartTime < paragraph.end + MATCH_EPSILON;
      const isMatchStartInParagraph =
        matchStartTime !== undefined && matchStartTime >= paragraph.start && matchStartTime < paragraph.end;

      const targetWordInParagraph = wordsInParagraph.find(
        (word) =>
          matchStartTime !== undefined &&
          matchEndTime !== undefined &&
          word.end >= matchStartTime - MATCH_EPSILON &&
          word.start <= matchEndTime + MATCH_EPSILON,
      );

      if (isMatchOverlappingParagraph) {
        const element = paragraphRef.current;
        const targetWordIndex = targetWordInParagraph
          ? `s-${targetWordInParagraph.section_idx}-p-${targetWordInParagraph.para_idx}-word-${targetWordInParagraph.word_idx}`
          : null;
        const targetWordElement = targetWordIndex
          ? (document.querySelector(`[data-word-index="${targetWordIndex}"]`) as HTMLElement | null)
          : null;
        if (!targetWordElement && !isMatchStartInParagraph) {
          return;
        }
        const elementToScroll = targetWordElement ?? element;
        const isCenteredWordScroll = Boolean(targetWordElement);

        if (elementToScroll) {
          setTimeout(() => {
            isProgrammaticScrollRef.current = true;
            if (isCenteredWordScroll) {
              scrollElementIntoContainerCenter(elementToScroll, scrollContainer);
            } else {
              scrollElementIntoContainer(elementToScroll, scrollContainer, transcriptTopOffset);
            }
            setTimeout(() => {
              isProgrammaticScrollRef.current = false;
            }, 120);
          }, 100);
        }
      }
    }

    // Handle traditional search matches
    if (traditionalCurrentMatchIndex >= 0 && traditionalSearchMatches[traditionalCurrentMatchIndex]) {
      const targetWord = traditionalSearchMatches[traditionalCurrentMatchIndex];
      const targetWordIndex = `s-${targetWord.section_idx}-p-${targetWord.para_idx}-word-${targetWord.word_idx}`;
      const targetWordElement = document.querySelector(`[data-word-index="${targetWordIndex}"]`) as HTMLElement | null;
      if (targetWordElement) {
        setTimeout(() => {
          isProgrammaticScrollRef.current = true;
          scrollElementIntoContainer(targetWordElement, scrollContainer, transcriptTopOffset);
          setTimeout(() => {
            isProgrammaticScrollRef.current = false;
          }, 120);
        }, 100);
      }
    }
  }, [
    allWords,
    currentSemanticMatchIndex,
    transcriptTopOffset,
    paragraph.end,
    paragraph.start,
    semanticSearchMatches,
    traditionalCurrentMatchIndex,
    traditionalSearchMatches,
    isProgrammaticScrollRef,
    wordsInParagraph,
  ]);

  // Auto-scroll
  useEffect(() => {
    if (!isPlaying) return;

    if (isCurrentTimeOutOfView) return;

    const isElementInView = (el: HTMLElement, container: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return rect.top >= containerRect.top && rect.bottom <= containerRect.bottom;
    };

    const element = paragraphRef.current;
    const scrollContainer = document.getElementById('transcript-panel-content');

    if (!element || !scrollContainer) return;

    const isCurrentTimeInParagraph = currentTime >= paragraph.start && currentTime < paragraph.end;

    if (!isCurrentTimeInParagraph) return;

    if (!isElementInView(element, scrollContainer)) {
      isProgrammaticScrollRef.current = true;

      scrollElementIntoContainer(element, scrollContainer, transcriptTopOffset);

      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 100);
    }
  }, [
    currentTime,
    paragraph.start,
    paragraph.end,
    isPlaying,
    isCurrentTimeOutOfView,
    isProgrammaticScrollRef,
    transcriptTopOffset,
  ]);

  /**
   * render
   */
  return (
    <Box
      ref={paragraphRef}
      data-paragraph-start={paragraph.start}
      data-paragraph-end={paragraph.end}
      sx={{
        mb: 2,
        wordBreak: 'break-word',
        transition: 'all 0.3s ease',
      }}>
      <Typography color="primary" fontSize="12px" fontWeight="bold" gutterBottom>
        {formatTime(paragraph.start)} {paragraph.speaker}
      </Typography>

      <Box>
        {wordsInParagraph.map((word, wordIndex) => {
          if (renderedWordIndexes.has(wordIndex)) return null;

          const nextWord = wordsInParagraph[wordIndex + 1];
          const isCurrent =
            currentTime >= word.start && (nextWord ? currentTime < nextWord.start : currentTime <= word.end);

          const isPast = !isCurrent && currentTime > word.end;

          const nerMatch = ner_data.find(
            (ner: any) =>
              word.start >= ner.start_time && word.end <= ner.end_time && selected_ner_labels.includes(ner.label),
          );

          const isNerSelected = Boolean(nerMatch);

          // Render NER label with grouped words
          if (isNerSelected && nerMatch) {
            const nerWords: Word[] = [];
            const nerEnd = nerMatch.end_time;

            for (let i = wordIndex; i < wordsInParagraph.length; i++) {
              const w = wordsInParagraph[i];
              if (w.start >= nerMatch.start_time && w.end <= nerEnd) {
                nerWords.push(w);
                renderedWordIndexes.add(i);
              } else {
                break;
              }
            }

            // Check if any of the NER words is currently being spoken
            const isNerCurrentlyActive = nerWords.some((w) => {
              const nextWordInNer = nerWords[nerWords.indexOf(w) + 1];
              return (
                currentTime >= w.start && (nextWordInNer ? currentTime < nextWordInNer.start : currentTime <= w.end)
              );
            });

            return (
              <StoryTranscriptNERGroupWords
                key={`ner-${wordIndex}`}
                nerWords={nerWords}
                label={nerMatch.label}
                isActive={isNerCurrentlyActive}
                onClick={() => seekTo(nerMatch.start_time)}
                paragraph={paragraph}
              />
            );
          }

          const currentSemanticMatch =
            currentSemanticMatchIndex >= 0 ? semanticSearchMatches[currentSemanticMatchIndex] : null;
          const isCurrentMatchInParagraph =
            currentSemanticMatch &&
            currentSemanticMatch.properties?.start_time >= paragraph.start &&
            currentSemanticMatch.properties?.start_time < paragraph.end;

          const isFirstWordOfCurrentMatch =
            isCurrentMatchInParagraph && word.start === currentSemanticMatch?.properties?.start_time;

          return (
            <React.Fragment key={`word-${word.word_idx}`}>
              {isFirstWordOfCurrentMatch && (
                <span
                  style={{
                    marginRight: '6px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    backgroundColor: colors.info.main,
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    verticalAlign: 'middle',
                    lineHeight: '1',
                  }}>
                  Score: {((currentSemanticMatch?.metadata?.score ?? 0) * 100).toFixed(1)}%
                </span>
              )}
              <StoryTranscriptWord word={word} isCurrent={isCurrent} isPast={isPast} paragraph={paragraph} />
            </React.Fragment>
          );
        })}
      </Box>
    </Box>
  );
});

StoryTranscriptParagraph.displayName = 'StoryTranscriptParagraph';
