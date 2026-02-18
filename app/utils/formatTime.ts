export const formatTime = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const hoursPrefix = hrs > 0 ? `${hrs}:` : '';
  const minutesPart = hrs > 0 ? mins.toString().padStart(2, '0') : mins.toString();
  const secondsPart = secs.toString().padStart(2, '0');

  return `${hoursPrefix}${minutesPart}:${secondsPart}`;
};
