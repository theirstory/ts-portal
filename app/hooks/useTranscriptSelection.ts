'use client';

import { useState, useEffect, useCallback } from 'react';

export type TranscriptSelection = {
  selectedText: string;
  startTime: number;
  endTime: number;
  hasSelection: boolean;
};

const EMPTY_SELECTION: TranscriptSelection = {
  selectedText: '',
  startTime: 0,
  endTime: 0,
  hasSelection: false,
};

export function useTranscriptSelection(): TranscriptSelection {
  const [selection, setSelection] = useState<TranscriptSelection>(EMPTY_SELECTION);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection(EMPTY_SELECTION);
      return;
    }

    const range = sel.getRangeAt(0);
    const container = document.getElementById('transcript-panel-content');
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setSelection(EMPTY_SELECTION);
      return;
    }

    // Find all word spans within the selection range
    const wordSpans = container.querySelectorAll<HTMLElement>('span[data-word-start]');
    let minStart = Infinity;
    let maxEnd = -Infinity;
    let foundWords = false;

    for (const span of wordSpans) {
      if (range.intersectsNode(span)) {
        const start = parseFloat(span.dataset.wordStart || '');
        const end = parseFloat(span.dataset.wordEnd || '');
        if (!isNaN(start) && !isNaN(end)) {
          minStart = Math.min(minStart, start);
          maxEnd = Math.max(maxEnd, end);
          foundWords = true;
        }
      }
    }

    if (!foundWords) {
      setSelection(EMPTY_SELECTION);
      return;
    }

    const selectedText = sel.toString().trim();
    if (!selectedText) {
      setSelection(EMPTY_SELECTION);
      return;
    }

    setSelection({
      selectedText,
      startTime: minStart,
      endTime: maxEnd,
      hasSelection: true,
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  return selection;
}
