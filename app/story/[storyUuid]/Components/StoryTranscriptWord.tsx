import { memo, useCallback } from 'react';
import usePlayerStore from '@/app/stores/usePlayerStore';
import { Word } from '@/types/transcription';
import { colors } from '@/lib/theme';

type Props = {
  word: Word;
  nextWordStart?: number;
  hasTraditionalHighlight: boolean;
  isTraditionalMatch: boolean;
  isCurrentTraditionalMatch: boolean;
  isInCurrentSemanticMatch: boolean;
};

export const StoryTranscriptWord = memo(
  ({
    word,
    nextWordStart,
    hasTraditionalHighlight,
    isTraditionalMatch,
    isCurrentTraditionalMatch,
    isInCurrentSemanticMatch,
  }: Props) => {
    const seekTo = usePlayerStore((state) => state.seekTo);
    const wordIndex = `s-${word.section_idx}-p-${word.para_idx}-word-${word.word_idx}`;

    const wordPlaybackPhase = usePlayerStore(
      useCallback(
        (state) => {
          const t = state.currentTime;
          if (t < word.start) return -1;
          if (nextWordStart !== undefined) return t < nextWordStart ? 0 : 1;
          return t <= word.end ? 0 : 1;
        },
        [nextWordStart, word.end, word.start],
      ),
    );
    const isCurrent = wordPlaybackPhase === 0;
    const isPast = wordPlaybackPhase === 1;

    return (
      <span
        onClick={() => seekTo(word.start)}
        data-word-start={word.start}
        data-word-end={word.end}
        data-word-index={wordIndex}
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
              : isInCurrentSemanticMatch
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
  },
);

StoryTranscriptWord.displayName = 'StoryTranscriptWord';
