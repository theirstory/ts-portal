/**
 * Format a recording's metadata as a Chicago-style bibliography entry.
 * Format: Author. "Title." Archive Name, Year. Medium, Duration. URL
 */

export type ChicagoCitationParams = {
  interviewTitle: string;
  participants?: string[];
  recordingDate: string;
  interviewDurationSeconds: number;
  isAudio: boolean;
  archiveName: string;
  pageUrl: string;
};

function toLastFirst(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const first = parts.slice(0, -1).join(' ');
    return `${last}, ${first}`;
  }
  return name.trim();
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function extractYear(recordingDate: string): string {
  if (!recordingDate || typeof recordingDate !== 'string') return '';
  const match = recordingDate.match(/\d{4}/);
  return match ? match[0] : recordingDate.trim().slice(0, 4) || '';
}

export function formatChicagoCitation(params: ChicagoCitationParams): string {
  const {
    interviewTitle,
    participants,
    recordingDate,
    interviewDurationSeconds,
    isAudio,
    archiveName,
    pageUrl,
  } = params;

  const author = participants?.length
    ? toLastFirst(participants[0])
    : interviewTitle.includes(',')
      ? interviewTitle
      : toLastFirst(interviewTitle);
  const title = interviewTitle.includes('"') ? interviewTitle : `"${interviewTitle}"`;
  const year = extractYear(recordingDate);
  const medium = isAudio ? 'Audio' : 'Video';
  const duration = formatDuration(interviewDurationSeconds);
  const durationPart = duration ? ` ${duration}.` : '.';

  const parts = [
    `${author}. ${title}.`,
    archiveName ? `${archiveName},` : '',
    year ? ` ${year}.` : '.',
    ` ${medium},${durationPart}`,
    pageUrl ? ` ${pageUrl}` : '',
  ];

  return parts
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*\./g, '.')
    .trim();
}
