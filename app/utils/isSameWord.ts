import { Word } from '@/types/transcription';
import { SearchMatch } from '../stores/useSearchStore';

export const isSameWord = (word: Word, match: SearchMatch): boolean => {
  return word.section_idx === match.section_idx && word.para_idx === match.para_idx && word.word_idx === match.word_idx;
};
