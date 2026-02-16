import { memo } from 'react';
import { getNerColor } from '@/config/organizationConfig';
import { Paragraph, Word } from '@/types/transcription';
import { colors } from '@/lib/theme';

type Props = {
  nerWords: Word[];
  label: string;
  isActive: boolean;
  onClick: () => void;
  paragraph: Paragraph;
};

export const StoryTranscriptNERGroupWords = memo(({ nerWords, label, isActive, onClick }: Props) => {
  const color = getNerColor(label);

  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: color,
        borderRadius: '4px',
        padding: '2px',
        marginRight: '4px',
        cursor: 'pointer',
        userSelect: 'none',
        border: isActive ? `2px solid ${color}` : 'none',
      }}>
      <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{nerWords.map((w) => w.text).join(' ')}</span>
      <span
        style={{
          marginLeft: '6px',
          fontSize: '10px',
          color: colors.text.primary,
        }}>
        {label.replace(/_/g, ' ').toUpperCase()}
      </span>
    </span>
  );
});

StoryTranscriptNERGroupWords.displayName = 'StoryTranscriptNERGroupWords';
