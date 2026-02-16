export const getMuxPlaybackId = (videoUrl: string | null): string | null => {
  if (!videoUrl) return null;
  const playbackIdFromUrl = videoUrl?.match(/stream\.mux\.com\/([^.?/]+)/)?.[1];
  return playbackIdFromUrl || null;
};
