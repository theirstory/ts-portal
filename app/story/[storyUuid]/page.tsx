import { StoryContainer } from './Components/StoryContainer';

export default async function StoryPage({ params }: { params: Promise<{ storyUuid: string }> }) {
  const { storyUuid } = await params;

  return <StoryContainer storyUuid={storyUuid} />;
}
