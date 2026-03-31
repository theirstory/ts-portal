'use client';

import { Box, Typography, Accordion, AccordionSummary, AccordionDetails, Button } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { StoryTranscriptToolbar } from './StoryTranscriptToolbar';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { StoryTranscriptParagraph } from './StoryTranscriptParagraph';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranscriptPanelStore } from '@/app/stores/useTranscriptPanelStore';
import usePlayerStore from '@/app/stores/usePlayerStore';
import { useSearchParams } from 'next/navigation';
import { colors } from '@/lib/theme';
import { useTranscriptNavigation } from '@/app/hooks/useTranscriptNavigation';
import { scrollElementIntoContainer } from '@/app/utils/scrollElementIntoContainer';

interface StoryTranscriptPanelProps {
  isMobile?: boolean;
}

export const StoryTranscriptPanel = ({ isMobile = false }: StoryTranscriptPanelProps) => {
  /**
   * hooks
   */
  const searchParams = useSearchParams();

  /**
   * store
   */
  const { transcript } = useSemanticSearchStore();
  const {
    expandedSections,
    toggleSection,
    initializeExpandedSections,
    setIsCurrentTimeOutOfView,
    isCurrentTimeOutOfView,
  } = useTranscriptPanelStore();
  const { isPlaying, currentTime } = usePlayerStore();
  const { seekAndScroll, scrollToTime } = useTranscriptNavigation();

  /**
   * refs
   */
  const isProgrammaticScrollRef = useRef(false);

  /**
   * state
   */
  const [urlHighlightRange, setUrlHighlightRange] = useState<{ start: number; end: number } | null>(null);
  const targetScrollTime = useTranscriptPanelStore((state) => state.targetScrollTime);
  const setTargetScrollTime = useTranscriptPanelStore((state) => state.setTargetScrollTime);

  /**
   * variables
   */
  const sections = useMemo(() => transcript?.sections ?? [], [transcript?.sections]);
  const areAccordionsInitialized = Object.keys(expandedSections).length === sections.length;
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  /**
   * Expand the accordion section that contains the target scroll time so the paragraph can mount and scroll.
   * Without this, the paragraph at e.g. 1:10:53 is inside a collapsed section and never runs its scroll effect.
   */
  useEffect(() => {
    if (targetScrollTime === null || sections.length === 0) return;
    const section = sections.find((sec) => {
      const paragraphs = sec.paragraphs ?? [];
      return paragraphs.some((p) => targetScrollTime >= p.start && targetScrollTime < p.end);
    });
    if (section && !expandedSections[section.start]) {
      toggleSection(section.start);
    }
  }, [targetScrollTime, sections, expandedSections, toggleSection]);

  /**
   * effects
   */
  useEffect(() => {
    const startTimes = transcript?.sections?.map((s) => s.start) || [];
    initializeExpandedSections(startTimes);
  }, [initializeExpandedSections, transcript?.sections]);

  useEffect(() => {
    if (!isPlaying) return;

    const scrollContainer = document.getElementById('transcript-panel-content');
    if (!scrollContainer) return;

    let lastUserInteractionTs = 0;

    const markAsUserInitiated = () => {
      lastUserInteractionTs = Date.now();
    };

    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      if (isCurrentTimeOutOfView) return;

      const now = Date.now();
      const USER_SCROLL_WINDOW_MS = 280;
      const isLikelyUserScroll = now - lastUserInteractionTs <= USER_SCROLL_WINDOW_MS;
      if (!isLikelyUserScroll) return;

      setIsCurrentTimeOutOfView(true);
      lastUserInteractionTs = 0;
    };

    scrollContainer.addEventListener('pointerdown', markAsUserInitiated);
    scrollContainer.addEventListener('wheel', markAsUserInitiated);
    scrollContainer.addEventListener('touchstart', markAsUserInitiated);
    scrollContainer.addEventListener('scroll', handleScroll);

    return () => {
      scrollContainer.removeEventListener('pointerdown', markAsUserInitiated);
      scrollContainer.removeEventListener('wheel', markAsUserInitiated);
      scrollContainer.removeEventListener('touchstart', markAsUserInitiated);
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [isPlaying, isCurrentTimeOutOfView, setIsCurrentTimeOutOfView, isProgrammaticScrollRef]);

  // When targetScrollTime matches a section start, scroll to the section heading instead of the paragraph
  useEffect(() => {
    if (targetScrollTime === null) return;
    const matchingSection = sections.find((s) => s.start === targetScrollTime);
    if (!matchingSection) return;

    const scrollContainer = document.getElementById('transcript-panel-content');
    const sectionEl = scrollContainer?.querySelector(
      `[data-section-start="${matchingSection.start}"]`,
    ) as HTMLElement | null;
    if (!sectionEl || !scrollContainer) return;

    setTargetScrollTime(null);
    isProgrammaticScrollRef.current = true;
    scrollElementIntoContainer(sectionEl, scrollContainer, -8);
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 120);
  }, [targetScrollTime, sections, setTargetScrollTime]);

  useEffect(() => {
    if (!areAccordionsInitialized) return;
    if (!startParam) {
      setUrlHighlightRange(null);
      return;
    }

    const startTime = Number(startParam);
    if (Number.isNaN(startTime)) return;

    seekAndScroll(startTime);

    if (!endParam) {
      setUrlHighlightRange(null);
      return;
    }

    const endTime = Number(endParam);
    if (Number.isNaN(endTime) || endTime <= startTime) {
      setUrlHighlightRange(null);
      return;
    }

    setUrlHighlightRange({ start: startTime, end: endTime });

    const timeoutId = setTimeout(() => {
      setUrlHighlightRange(null);
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [areAccordionsInitialized, startParam, endParam, seekAndScroll]);

  if (!areAccordionsInitialized) return null;

  return (
    <Box
      id="transcript-panel-container"
      sx={{
        bgcolor: colors.background.default,
        borderRadius: isMobile ? 0 : 2,
        p: isMobile ? 1.5 : 2,
        height: '100%',
        minHeight: 0,
      }}
      display="flex"
      overflow="hidden"
      flexDirection="column"
      gap={isMobile ? 1 : 2}
      position="relative">
      <StoryTranscriptToolbar isMobile={isMobile} />
      <Box
        id="transcript-panel-content"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          pr: isMobile ? 0 : 1,
        }}>
        {sections.map((section) => {
          const sectionParagraphs = section.paragraphs || [];

          const isExpanded = !!expandedSections[section.start];

          return (
            <Accordion key={section.start} expanded={isExpanded} onChange={() => toggleSection(section.start)}>
              <AccordionSummary
                sx={{ backgroundColor: colors.primary.main, borderRadius: 1 }}
                expandIcon={<ExpandMoreIcon />}
                data-section-start={section.start}>
                <Box display="flex" flexDirection="column" gap={1}>
                  <Typography variant="subtitle1" fontWeight="bold" color={colors.common.white}>
                    {section.title}
                  </Typography>

                  {section.synopsis && (
                    <Typography fontSize="12px" color={colors.common.white}>
                      {section.synopsis}
                    </Typography>
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ paddingX: '8px' }}>
                {sectionParagraphs.map((paragraph) => {
                  const wordsInParagraph = paragraph.words || [];

                  return (
                    <StoryTranscriptParagraph
                      key={paragraph.start}
                      paragraph={paragraph}
                      wordsInParagraph={wordsInParagraph}
                      isProgrammaticScrollRef={isProgrammaticScrollRef}
                      urlHighlightRange={urlHighlightRange}
                    />
                  );
                })}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
      {isCurrentTimeOutOfView && (
        <Box
          sx={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999,
          }}>
          <Button
            size="small"
            sx={{
              textTransform: 'none',
              bgcolor: colors.primary.dark,
              color: colors.primary.contrastText,
              '&:hover': {
                bgcolor: colors.primary.light,
              },
            }}
            variant="contained"
            onClick={() => {
              scrollToTime(currentTime);
              setIsCurrentTimeOutOfView(false);
            }}>
            Resume Auto-Scroll
          </Button>
        </Box>
      )}
    </Box>
  );
};
