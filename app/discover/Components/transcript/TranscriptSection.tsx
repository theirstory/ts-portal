'use client';

import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { colors } from '@/lib/theme';
import { Section, Word } from '@/types/transcription';
import { SearchMode, ThematicMatch } from './transcriptTypes';

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TranscriptWord({
  word,
  isActive,
  isPast,
  isHighlighted,
  isActiveMatch,
  isThematicHighlight,
  isActiveThematicMatch,
  matchKey,
  onClick,
}: {
  word: Word;
  isActive: boolean;
  isPast: boolean;
  isHighlighted: boolean;
  isActiveMatch?: boolean;
  isThematicHighlight?: boolean;
  isActiveThematicMatch?: boolean;
  matchKey?: string;
  onClick: () => void;
}) {
  const getBgColor = () => {
    if (isActiveMatch || isActiveThematicMatch) return colors.warning.main;
    if (isActive) return colors.warning.main;
    if (isThematicHighlight) return `${colors.success.main}30`;
    if (isHighlighted) return `${colors.warning.main}40`;
    return 'transparent';
  };

  return (
    <span
      onClick={onClick}
      data-start={word.start}
      {...(matchKey ? { 'data-match-key': matchKey } : {})}
      style={{
        cursor: 'pointer',
        display: 'inline',
        backgroundColor: getBgColor(),
        color:
          isPast && !isActive && !isHighlighted && !isActiveMatch && !isThematicHighlight
            ? colors.text.secondary
            : colors.text.primary,
        borderRadius: isActive || isActiveMatch || isActiveThematicMatch ? '2px' : undefined,
        outline: isActiveMatch || isActiveThematicMatch ? `2px solid ${colors.primary.main}` : undefined,
        transition: 'background-color 0.1s, color 0.1s',
      }}>
      {word.text}{' '}
    </span>
  );
}

export function TranscriptSection({
  section,
  sectionIndex,
  currentTime,
  highlightStart,
  highlightEnd,
  searchTerm,
  searchMode,
  thematicRanges,
  activeThematicIndex,
  activeMatchKey,
  isExpanded,
  onToggle,
  onWordClick,
}: {
  section: Section;
  sectionIndex: number;
  currentTime: number;
  highlightStart: number;
  highlightEnd: number;
  searchTerm: string;
  searchMode: SearchMode | null;
  thematicRanges: ThematicMatch[];
  activeThematicIndex: number;
  activeMatchKey: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onWordClick: (time: number) => void;
}) {
  const searchLower = searchMode === 'text' ? searchTerm.toLowerCase() : '';

  return (
    <Accordion
      expanded={isExpanded}
      onChange={onToggle}
      disableGutters
      sx={{
        '&:before': { display: 'none' },
        boxShadow: 'none',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        data-section-start={section.start}
        sx={{
          bgcolor: colors.primary.main,
          color: colors.primary.contrastText,
          minHeight: 40,
          '&.Mui-expanded': { minHeight: 40 },
          '& .MuiAccordionSummary-content': { my: 0.75 },
          '& .MuiAccordionSummary-expandIconWrapper': { color: colors.primary.contrastText },
        }}>
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {formatTimestamp(section.start)} &middot; {section.title}
          </Typography>
          {section.synopsis && (
            <Typography variant="caption" sx={{ opacity: 0.85, display: 'block', mt: 0.25 }}>
              {section.synopsis}
            </Typography>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, py: 1.5 }}>
        {section.paragraphs.map((para, pIdx) => (
          <Box key={pIdx} sx={{ mb: 1.5 }}>
            {para.speaker && (
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.25 }}>
                {para.speaker} &middot; {formatTimestamp(para.start)}
              </Typography>
            )}
            <Typography variant="body2" component="div" sx={{ lineHeight: 1.8 }}>
              {para.words.map((word, wIdx) => {
                const isPlaying = currentTime >= word.start && currentTime < (para.words[wIdx + 1]?.start ?? word.end);
                const isPast = currentTime >= word.end;
                const isCitationHighlight = word.start >= highlightStart && word.end <= highlightEnd;
                const isSearchMatch = !!searchLower && word.text.toLowerCase().includes(searchLower);
                const matchKey = isSearchMatch ? `${sectionIndex}-${pIdx}-${wIdx}` : undefined;
                const isActiveMatch = matchKey !== undefined && matchKey === activeMatchKey;

                let isThematicHighlight = false;
                let isActiveThematicMatch = false;
                let thematicMatchKey: string | undefined;

                if (searchMode === 'thematic' && thematicRanges.length > 0) {
                  for (let thematicIndex = 0; thematicIndex < thematicRanges.length; thematicIndex++) {
                    const range = thematicRanges[thematicIndex];
                    if (word.start >= range.startTime && word.start < range.endTime) {
                      isThematicHighlight = true;
                      if (word.start <= range.startTime + 0.5) {
                        thematicMatchKey = `t-${thematicIndex}`;
                        if (thematicIndex === activeThematicIndex) {
                          isActiveThematicMatch = true;
                        }
                      }
                      break;
                    }
                  }
                }

                return (
                  <TranscriptWord
                    key={wIdx}
                    word={word}
                    isActive={isPlaying}
                    isPast={isPast}
                    isHighlighted={isCitationHighlight || isSearchMatch}
                    isActiveMatch={isActiveMatch}
                    isThematicHighlight={isThematicHighlight}
                    isActiveThematicMatch={isActiveThematicMatch}
                    matchKey={matchKey ?? thematicMatchKey}
                    onClick={() => onWordClick(word.start)}
                  />
                );
              })}
            </Typography>
          </Box>
        ))}
      </AccordionDetails>
    </Accordion>
  );
}
