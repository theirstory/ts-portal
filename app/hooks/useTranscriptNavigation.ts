import { useCallback } from 'react';
import usePlayerStore from '@/app/stores/usePlayerStore';
import { useTranscriptPanelStore } from '@/app/stores/useTranscriptPanelStore';

const isValidTime = (time: unknown): time is number => typeof time === 'number' && Number.isFinite(time);

export const useTranscriptNavigation = () => {
  const seekTo = usePlayerStore((state) => state.seekTo);
  const setTargetScrollTime = useTranscriptPanelStore((state) => state.setTargetScrollTime);

  const seekOnly = useCallback(
    (time: unknown) => {
      if (!isValidTime(time)) return false;
      seekTo(time);
      return true;
    },
    [seekTo],
  );

  const scrollToTime = useCallback(
    (time: unknown) => {
      if (!isValidTime(time)) return false;
      setTargetScrollTime(time);
      return true;
    },
    [setTargetScrollTime],
  );

  const seekAndScroll = useCallback(
    (time: unknown) => {
      if (!isValidTime(time)) return false;
      seekTo(time);
      setTargetScrollTime(time);
      return true;
    },
    [seekTo, setTargetScrollTime],
  );

  return {
    seekOnly,
    scrollToTime,
    seekAndScroll,
  };
};
