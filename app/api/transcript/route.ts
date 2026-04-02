import { fetchStoryTranscriptByUuid } from '@/lib/weaviate/search';
import { Transcription } from '@/types/transcription';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storyId = searchParams.get('storyId');

  if (!storyId) {
    return Response.json({ error: 'storyId is required' }, { status: 400 });
  }

  try {
    const response = await fetchStoryTranscriptByUuid(storyId);
    if (!response?.properties) {
      return Response.json({ error: 'Story not found' }, { status: 404 });
    }

    const props = response.properties;
    const transcription: Transcription = JSON.parse(props.transcription);
    const videoUrl: string = props.video_url;
    const isAudioFile: boolean = props.isAudioFile;
    const interviewTitle: string = props.interview_title;

    return Response.json({
      transcription,
      videoUrl,
      isAudioFile,
      interviewTitle,
    });
  } catch (error) {
    console.error('Transcript API error:', error);
    return Response.json({ error: 'Failed to fetch transcript' }, { status: 500 });
  }
}
