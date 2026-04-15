import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { InterviewSaveData, NoteSaveData } from '@/lib/zotero/types';

type ZoteroStore = {
  isAuthenticated: boolean;
  userID: string | null;
  username: string | null;
  isCheckingAuth: boolean;
  isSaving: boolean;
  lastSavedItemKey: string | null;
  lastSaveError: string | null;
  lastSaveSuccess: string | null;

  checkAuthStatus: () => Promise<void>;
  startOAuthFlow: (returnTo: string) => Promise<void>;
  logout: () => Promise<void>;
  saveInterview: (data: InterviewSaveData) => Promise<string | null>;
  saveSelectionNote: (data: NoteSaveData) => Promise<void>;
  checkExistingItem: (storyUrl: string) => Promise<void>;
  clearSaveState: () => void;
  clearLastSavedItemKey: () => void;
};

export const useZoteroStore = create<ZoteroStore>()(
  devtools(
    (set, get) => ({
      isAuthenticated: false,
      userID: null,
      username: null,
      isCheckingAuth: true,
      isSaving: false,
      lastSavedItemKey: null,
      lastSaveError: null,
      lastSaveSuccess: null,

      checkAuthStatus: async () => {
        set({ isCheckingAuth: true }, false, 'checkAuthStatus:start');
        try {
          const res = await fetch('/api/zotero/auth/status');
          const data = await res.json();
          set(
            {
              isAuthenticated: data.authenticated ?? false,
              userID: data.userID ?? null,
              username: data.username ?? null,
              isCheckingAuth: false,
            },
            false,
            'checkAuthStatus:success',
          );
        } catch {
          set({ isAuthenticated: false, isCheckingAuth: false }, false, 'checkAuthStatus:error');
        }
      },

      startOAuthFlow: async (returnTo: string) => {
        try {
          const res = await fetch('/api/zotero/auth/request-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnTo }),
          });
          const data = await res.json();
          if (data.authorizationUrl) {
            window.location.href = data.authorizationUrl;
          } else {
            console.error('No authorization URL returned:', data.error);
          }
        } catch (error) {
          console.error('Failed to start Zotero OAuth:', error);
        }
      },

      logout: async () => {
        try {
          await fetch('/api/zotero/auth/logout', { method: 'POST' });
          set(
            {
              isAuthenticated: false,
              userID: null,
              username: null,
              lastSavedItemKey: null,
            },
            false,
            'logout',
          );
        } catch (error) {
          console.error('Failed to disconnect Zotero:', error);
        }
      },

      saveInterview: async (data: InterviewSaveData) => {
        set({ isSaving: true, lastSaveError: null, lastSaveSuccess: null }, false, 'saveInterview:start');
        try {
          const res = await fetch('/api/zotero/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Failed to save');

          set(
            {
              isSaving: false,
              lastSavedItemKey: result.itemKey,
              lastSaveSuccess: 'Interview saved to Zotero',
            },
            false,
            'saveInterview:success',
          );
          return result.itemKey as string;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to save to Zotero';
          set({ isSaving: false, lastSaveError: message }, false, 'saveInterview:error');
          return null;
        }
      },

      saveSelectionNote: async (data: NoteSaveData) => {
        set({ isSaving: true, lastSaveError: null, lastSaveSuccess: null }, false, 'saveSelectionNote:start');
        try {
          const res = await fetch('/api/zotero/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Failed to save note');

          set(
            { isSaving: false, lastSaveSuccess: 'Excerpt saved to Zotero' },
            false,
            'saveSelectionNote:success',
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to save note';
          set({ isSaving: false, lastSaveError: message }, false, 'saveSelectionNote:error');
        }
      },

      checkExistingItem: async (storyUrl: string) => {
        if (!get().isAuthenticated) return;
        try {
          const res = await fetch('/api/zotero/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: storyUrl }),
          });
          const data = await res.json();
          if (data.exists && data.itemKey) {
            set({ lastSavedItemKey: data.itemKey }, false, 'checkExistingItem:found');
          }
        } catch {
          // Non-critical — if it fails, user can still save (will create a new item)
        }
      },

      clearSaveState: () => {
        set({ lastSaveError: null, lastSaveSuccess: null }, false, 'clearSaveState');
      },

      clearLastSavedItemKey: () => {
        set({ lastSavedItemKey: null }, false, 'clearLastSavedItemKey');
      },
    }),
    { name: 'Zotero Store' },
  ),
);
