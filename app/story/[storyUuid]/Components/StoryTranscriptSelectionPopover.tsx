'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Paper, CircularProgress } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { isZoteroEnabled } from '@/config/organizationConfig';
import { useZoteroStore } from '@/app/stores/useZoteroStore';
import { ZoteroIcon } from '@/components/zotero/ZoteroIcon';

type SearchType = 'bm25' | 'vector' | 'hybrid';

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSearch?: (query: string, type: SearchType) => void;
  onZoteroSave?: (selectedText: string, startTime: number, endTime: number) => void;
};

const SEARCH_BUTTONS: { type: SearchType; label: string }[] = [
  { type: 'bm25', label: 'Keyword' },
  { type: 'vector', label: 'Thematic' },
  { type: 'hybrid', label: 'Hybrid' },
];

function getSelectionTimeRange(container: HTMLElement): { startTime: number; endTime: number } | null {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return null;

  const range = selection.getRangeAt(0);
  const wordSpans = container.querySelectorAll<HTMLElement>('span[data-word-start]');
  let minStart = Infinity;
  let maxEnd = -Infinity;
  let found = false;

  for (const span of wordSpans) {
    if (range.intersectsNode(span)) {
      const start = parseFloat(span.dataset.wordStart || '');
      const end = parseFloat(span.dataset.wordEnd || '');
      if (!isNaN(start) && !isNaN(end)) {
        minStart = Math.min(minStart, start);
        maxEnd = Math.max(maxEnd, end);
        found = true;
      }
    }
  }

  return found ? { startTime: minStart, endTime: maxEnd } : null;
}

export const StoryTranscriptSelectionPopover = ({ containerRef, onSearch, onZoteroSave }: Props) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [timeRange, setTimeRange] = useState<{ startTime: number; endTime: number } | null>(null);
  const [activeSearchType, setActiveSearchType] = useState<SearchType | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = useZoteroStore((s) => s.isAuthenticated);
  const showZotero = isZoteroEnabled && isAuthenticated;

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';

      if (text.length < 3) {
        setPosition(null);
        setSelectedText('');
        setTimeRange(null);
        return;
      }

      const range = selection?.getRangeAt(0);
      if (!range) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      setPosition({
        top: rect.top - containerRect.top + container.scrollTop - 44,
        left: rect.left - containerRect.left + container.scrollLeft + rect.width / 2,
      });
      setSelectedText(text);
      setTimeRange(getSelectionTimeRange(container));
    }, 10);
  }, [containerRef]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (popoverRef.current?.contains(e.target as Node)) return;
    setPosition(null);
    setSelectedText('');
    setTimeRange(null);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef, handleMouseUp, handleMouseDown]);

  const handleSearch = (searchType: SearchType) => {
    if (!selectedText || activeSearchType) return;
    onSearch?.(selectedText, searchType);
    setPosition(null);
    setSelectedText('');
    setTimeRange(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleZoteroSave = () => {
    if (!selectedText || !timeRange) return;
    onZoteroSave?.(selectedText, timeRange.startTime, timeRange.endTime);
    setPosition(null);
    setSelectedText('');
    setTimeRange(null);
  };

  if (!position || !selectedText) return null;

  return (
    <Paper
      ref={popoverRef}
      elevation={4}
      sx={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
        zIndex: 1300,
        borderRadius: 2,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
      }}>
      {SEARCH_BUTTONS.map(({ type, label }) => (
        <Button
          key={type}
          size="small"
          startIcon={activeSearchType === type ? <CircularProgress size={14} /> : <SearchIcon fontSize="small" />}
          onClick={() => handleSearch(type)}
          disabled={activeSearchType !== null}
          sx={{
            textTransform: 'none',
            px: 1.5,
            py: 0.75,
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
            borderRadius: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
          }}>
          {label}
        </Button>
      ))}
      {showZotero && timeRange && (
        <Button
          size="small"
          startIcon={<ZoteroIcon size={14} />}
          onClick={handleZoteroSave}
          disabled={activeSearchType !== null}
          sx={{
            textTransform: 'none',
            px: 1.5,
            py: 0.75,
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
            borderRadius: 0,
          }}>
          Zotero
        </Button>
      )}
    </Paper>
  );
};
