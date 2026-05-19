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
  const text = nerWords.map((w) => w.text).join(' ');
  const labelText = label.replace(/_/g, ' ').toUpperCase();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${labelText}: ${text}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
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
      <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{text}</span>
      <span
        style={{
          marginLeft: '6px',
          fontSize: '10px',
          color: colors.text.primary,
        }}>
        {labelText}
      </span>
    </span>
  );
});

StoryTranscriptNERGroupWords.displayName = 'StoryTranscriptNERGroupWords';
