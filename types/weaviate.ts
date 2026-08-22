export enum SchemaTypes {
  Testimonies = "Testimonies",
  Chunks = "Chunks",
  Exhibits = "Exhibits",
}

export type Testimonies = {
  transcription: string;
  interview_title: string;
  interview_description: string;
  collection_id: string;
  collection_name: string;
  collection_description: string;
  folder_id: string;
  folder_name: string;
  folder_path: string;
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
  folder_id: string;
  folder_name: string;
  folder_path: string;
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

/**
 * A single document page or image, embedded into the same vector space as transcript
 * chunks so one query can retrieve across recordings, documents, and images.
 */
export type Exhibits = {
  source_id: string;
  source_type: string;
  image_category: string;
  title: string;
  description: string;
  ocr_text: string;
  page: number;
  page_count: number;
  collection_id: string;
  collection_name: string;
  collection_description: string;
  folder_id: string;
  folder_name: string;
  folder_path: string;
  exhibit_number: string;
  custodians: any;
  collection_code: string;
  image_url: string;
  thumbnail_url: string;
  source_url: string;
  pdf_url: string;
  document_date: string;
  related_ids: any;
  embedded_modality: string;
  date: string;
  // Archival metadata as the Industry Documents Library records it.
  bates_number: string;
  bates_by_page: any;
  bates_is_derived: boolean;
  case_numbers: any;
  authors: any;
  recipients: any;
  copied: any;
  genre: string;
  industry: string;
  drugs: any;
  alternate_title: string;
  conversation: string;
  date_sent: string;
  time_sent: string;
  date_received: string;
  attachments: any;
  original_filename: string;
  original_format: string;
  production_path: string;
  redacted: string;
  redaction_types: any;
  redacted_by: any;
  language: string;
  availability: any;
  date_added: string;
  idl_short_id: string;
}

export type SchemaMap = {
  [SchemaTypes.Testimonies]: Testimonies;
  [SchemaTypes.Chunks]: Chunks;
  [SchemaTypes.Exhibits]: Exhibits;
};
