import { memo } from 'react';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useSearchStore } from '@/app/stores/useSearchStore';
import usePlayerStore from '@/app/stores/usePlayerStore';
import { Paragraph, Word } from '@/types/transcription';
import { isSameWord } from '@/app/utils/isSameWord';
import { colors } from '@/lib/theme';

type Props = {
  word: Word;
  isCurrent: boolean;
  isPast: boolean;
  paragraph: Paragraph;
};

export const StoryTranscriptWord = memo(({ word, isCurrent, isPast, paragraph }: Props) => {
  // Small tolerance to avoid missing match boundaries due to floating-point precision.
  const MATCH_EPSILON = 0.001;

  const semanticSearchMatches = useSemanticSearchStore((state) => state.matches);
  const currentSemanticMatchIndex = useSemanticSearchStore((state) => state.currentMatchIndex);
  const traditionalSearchMatches = useSearchStore((state) => state.matches);
  const traditionalCurrentMatchIndex = useSearchStore((state) => state.currentMatchIndex);
  const traditionalSearchTerm = useSearchStore((state) => state.searchTerm);

  const seekTo = usePlayerStore((state) => state.seekTo);

  const hasTraditionalHighlight = traditionalSearchTerm.trim().length > 0;

  const isTraditionalMatch = traditionalSearchMatches.some((match) => isSameWord(word, match));

  const isCurrentTraditionalMatch =
    isTraditionalMatch && isSameWord(word, traditionalSearchMatches[traditionalCurrentMatchIndex]);

  const currentSemanticMatch =
    currentSemanticMatchIndex >= 0 ? semanticSearchMatches[currentSemanticMatchIndex] : undefined;
  const currentMatchStart = currentSemanticMatch?.properties?.start_time;
  const currentMatchEnd = currentSemanticMatch?.properties?.end_time;

  const isInCurrentSemanticMatch =
    currentMatchStart !== undefined &&
    currentMatchEnd !== undefined &&
    currentMatchEnd >= paragraph.start &&
    currentMatchStart <= paragraph.end &&
    word.start >= currentMatchStart - MATCH_EPSILON &&
    word.end <= currentMatchEnd + MATCH_EPSILON;

  return (
    <span
      onClick={() => seekTo(word.start)}
      data-word-start={word.start}
      data-word-end={word.end}
      data-word-index={`s-${word.section_idx}-p-${word.para_idx}-word-${word.word_idx}`}
      style={{
        fontSize: '12px',
        paddingRight: '2px',
        cursor: 'pointer',
        userSelect: 'none',
        backgroundColor: isCurrent
          ? colors.warning.main
          : hasTraditionalHighlight
            ? isCurrentTraditionalMatch
              ? colors.primary.main
              : isTraditionalMatch
                ? colors.grey[300]
                : 'transparent'
            : semanticSearchMatches.length > 0 && isInCurrentSemanticMatch
              ? colors.info.light
              : 'transparent',
        color: isCurrentTraditionalMatch
          ? colors.common.white
          : isCurrent || isPast
            ? colors.text.primary
            : colors.text.disabled,
        display: 'inline-block',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        transition: 'color 0.3s ease, background-color 0.3s ease',
      }}>
      {word.text}{' '}
    </span>
  );
});

StoryTranscriptWord.displayName = 'StoryTranscriptWord';
