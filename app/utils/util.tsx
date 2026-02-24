'use client';

import moment from 'moment';

export const durationFormatHandler = (duration: number) => {
  const durationObject = moment.duration(duration, 'seconds');
  const hours = durationObject.hours();
  const formatHour = hours.toString().length > 1 ? hours.toString() : `0${hours.toString()}`;
  return hours
    ? `${formatHour}:${moment(new Date(duration * 1000)).format('mm:ss')}`
    : moment(new Date(duration * 1000)).format('mm:ss');
};

export const durationFormatHandlerWithHours = (duration: number) => {
  const durationObject = moment.duration(duration, 'seconds');
  const hours = durationObject.hours();
  const formatHour = hours.toString().length > 1 ? hours.toString() : `0${hours.toString()}`;
  return `${formatHour}:${moment(new Date(duration * 1000)).format('mm:ss')}`;
};

export const isMobile = () => {
  if (typeof navigator !== 'undefined') {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }
  return false;
};

export const getTimeRange = (startTime: number, endTime: number) => {
  const timeRange = startTime > 0 || endTime > 0 ? `${formatTime(startTime)} - ${formatTime(endTime)}` : '';

  return timeRange;
};

export const formatTime = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const hoursPrefix = hrs > 0 ? `${hrs}:` : '';
  const minutesPart = hrs > 0 ? mins.toString().padStart(2, '0') : mins.toString();
  const secondsPart = secs.toString().padStart(2, '0');

  return `${hoursPrefix}${minutesPart}:${secondsPart}`;
};
