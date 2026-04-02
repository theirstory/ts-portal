'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSpeechRecognitionLanguage } from './ChatComposerControls';

type SpeechRecognitionAlternative = {
  transcript: string;
};

type SpeechRecognitionResult = {
  0: SpeechRecognitionAlternative;
};

type SpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type MicrophonePermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function hasMediaRecordingSupport(): boolean {
  if (typeof navigator === 'undefined') return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

function isSecureRecordingContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext;
}

type UseVoiceRecorderArgs = {
  language: string;
  inputValue: string;
  onConfirmText: (value: string) => void;
};

export function useVoiceRecorder({ language, inputValue, onConfirmText }: UseVoiceRecorderArgs) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const baseInputRef = useRef('');
  const transcriptRef = useRef('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<MicrophonePermissionState>('unknown');
  const hasSpeechRecognitionSupport = useMemo(() => Boolean(getSpeechRecognitionConstructor()), []);
  const hasMediaSupport = useMemo(() => hasMediaRecordingSupport(), []);
  const hasSecureContext = useMemo(() => isSecureRecordingContext(), []);
  const isSupported = hasSpeechRecognitionSupport && hasMediaSupport && hasSecureContext && permissionState !== 'denied';
  const unavailableReason = !hasSecureContext
    ? 'Voice input requires HTTPS or localhost'
    : !hasMediaSupport
      ? 'Microphone access is not available in this browser'
      : !hasSpeechRecognitionSupport
        ? 'Voice transcription is not supported in this browser'
        : permissionState === 'denied'
          ? 'Microphone permission is blocked. Enable it in your browser settings.'
          : null;

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator) || !navigator.permissions?.query) return;

    let cancelled = false;
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setPermissionState(status.state as MicrophonePermissionState);
        status.onchange = () => setPermissionState(status.state as MicrophonePermissionState);
      })
      .catch(() => {
        if (!cancelled) setPermissionState('unknown');
      });

    return () => {
      cancelled = true;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close();
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const clearState = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    transcriptRef.current = '';
    recognitionRef.current = null;
    setAudioLevels([]);
    setIsRecording(false);
  };

  const startAudioVisualization = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.82;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const targetBars = 46;

    const tick = () => {
      const activeAnalyser = analyserRef.current;
      if (!activeAnalyser) return;

      activeAnalyser.getByteFrequencyData(data);
      const bucketSize = Math.max(1, Math.floor(data.length / targetBars));
      const nextLevels = Array.from({ length: targetBars }, (_, index) => {
        const start = index * bucketSize;
        const end = Math.min(data.length, start + bucketSize);
        let total = 0;
        for (let i = start; i < end; i += 1) {
          total += data[i];
        }
        const average = total / Math.max(1, end - start);
        return Math.max(0.08, Math.min(1, average / 160));
      });

      setAudioLevels(nextLevels);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    tick();
  };

  const startRecording = async () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return;

    clearState();
    setErrorMessage(null);
    baseInputRef.current = inputValue.trim() ? `${inputValue.trim()} ` : '';
    transcriptRef.current = '';

    try {
      await startAudioVisualization();
      setPermissionState('granted');

      const recognition = new Recognition();
      recognition.lang = getSpeechRecognitionLanguage(language);
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          transcript += event.results[i][0].transcript;
        }
        transcriptRef.current = transcript.trim();
      };

      recognition.onerror = () => {
        setErrorMessage('Voice transcription failed. Please try again.');
        clearState();
      };

      recognition.onend = () => {
        clearState();
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          setPermissionState('denied');
          setErrorMessage('Microphone permission was denied. Enable it in your browser settings.');
        } else if (error.name === 'NotFoundError') {
          setErrorMessage('No microphone was found on this device.');
        } else {
          setErrorMessage('Could not access the microphone. Please try again.');
        }
      } else {
        setErrorMessage('Could not access the microphone. Please try again.');
      }
      clearState();
    }
  };

  const cancelRecording = () => {
    recognitionRef.current?.stop();
    clearState();
  };

  const confirmRecording = () => {
    const combinedText = `${baseInputRef.current}${transcriptRef.current}`.trim();
    recognitionRef.current?.stop();
    clearState();
    if (combinedText) {
      onConfirmText(combinedText);
    }
  };

  return {
    isSupported,
    unavailableReason,
    isRecording,
    audioLevels,
    errorMessage,
    startRecording,
    cancelRecording,
    confirmRecording,
  };
}
