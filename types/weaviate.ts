export enum SchemaTypes {
  Testimonies = "Testimonies",
  Chunks = "Chunks",
}

export type Testimonies = {
  transcription: string;
  interview_title: string;
  interview_description: string;
  collection_id: string;
  collection_name: string;
  collection_description: string;
  recording_date: string;
  transcoded: string;
  interview_duration: number;
  ner_labels: any;
  ner_data: any;
  participants: any;
  publisher: string;
  video_url: string;
  isAudioFile: boolean;
  hasChunks: any;
}

export type Chunks = {
  interview_duration: number;
  interview_title: string;
  collection_id: string;
  collection_name: string;
  collection_description: string;
  description: string;
  transcoded: string;
  asset_id: string;
  theirstory_id: string;
  organization_id: string;
  project_id: string;
  section_id: number;
  para_id: number;
  chunk_id: number;
  recording_date: string;
  transcription: string;
  speaker: string;
  interviewers: any;
  is_interviewer: boolean;
  word_timestamps: any;
  ner_data: any;
  ner_labels: any;
  ner_text: any;
  start_time: number;
  end_time: number;
  section_title: string;
  thumbnail_url: string;
  video_url: string;
  isAudioFile: boolean;
  date: string;
  belongsToTestimony: any;
}

export type SchemaMap = {
  [SchemaTypes.Testimonies]: Testimonies;
  [SchemaTypes.Chunks]: Chunks;
};
