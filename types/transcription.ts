export type Word = {
  start: number; // in seconds
  end: number; // in seconds
  text: string;
  para_idx: number; // index of the paragraph this word belongs to
  section_idx: number; // index of the section this word belongs to
  word_idx: number; // index of the word in the paragraph
};

export type Paragraph = {
  end: number; // in seconds
  ner: any[];
  speaker: string;
  start: number; // in seconds
  words: Word[];
};

export type Section = {
  title: string;
  timestamp: string; // "00:00:00"
  synopsis: string;
  start: number; // in seconds
  speaker: string;
  paragraphs: Paragraph[];
  end: number;
};

export type Transcription = {
  asset_id: string;
  id: string;
  sections: Section[];
  title: string;
  transcoded: string;
  weaviate_uuid: string;
};
