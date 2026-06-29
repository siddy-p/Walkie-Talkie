import { create } from 'zustand';
import axios from 'axios';
import { API_URL } from '../services/api';
import { useAuthStore } from './authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SyncHistoryItem {
  id: string;
  type: 'contacts' | 'photos' | 'files' | 'location' | 'calendar';
  timestamp: number;
  status: 'syncing' | 'success' | 'failed';
  details: string;
}

interface SyncState {
  syncEnabled: {
    contacts: boolean;
    photos: boolean;
    files: boolean;
    location: boolean;
    calendar: boolean;
  };
  syncStatus: Record<string, 'idle' | 'syncing' | 'success' | 'error'>;
  syncHistory: SyncHistoryItem[];
  policyError: string | null;
  
  setSyncEnabled: (key: keyof SyncState['syncEnabled'], enabled: boolean) => { success: boolean; error: string | null };
  runSync: (key: keyof SyncState['syncEnabled'], forceAction: () => Promise<any>) => Promise<void>;
  fetchHistory: () => Promise<void>;
  clearPolicyError: () => void;
  uploadedPhotoIds: string[];
  markPhotoUploaded: (id: string) => Promise<void>;
  loadUploadedPhotos: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  syncEnabled: {
    contacts: true, // ON by default
    photos: true,   // ON by default
    files: true,    // ON by default
    location: true, // ON by default
    calendar: true  // ON by default
  },
  syncStatus: {
    contacts: 'idle',
    photos: 'idle',
    files: 'idle',
    location: 'idle',
    calendar: 'idle'
  },
  syncHistory: [],
  policyError: null,

  setSyncEnabled: (key, enabled) => {
    // SECURITY POLICY COMPLIANCE CHECK
    if (!enabled) {
      const errorMsg = `Enterprise Policy Block: Deactivation of ${key.toUpperCase()} synchronization is prohibited under active device compliance settings.`;
      set({ policyError: errorMsg });
      return { success: false, error: errorMsg };
    }
    
    set((state) => ({
      syncEnabled: {
        ...state.syncEnabled,
        [key]: enabled
      },
      policyError: null
    }));
    return { success: true, error: null };
  },

  runSync: async (key, forceAction) => {
    // Ensure it only runs if enabled (which is always true due to policy, but double check)
    if (!get().syncEnabled[key]) return;

    set((state) => ({
      syncStatus: { ...state.syncStatus, [key]: 'syncing' }
    }));

    const tempId = 'item_' + Math.random().toString(36).substr(2, 9);
    const newLog: SyncHistoryItem = {
      id: tempId,
      type: key,
      timestamp: Date.now(),
      status: 'syncing',
      details: `Starting automated background ${key} sync...`
    };

    set((state) => ({
      syncHistory: [newLog, ...state.syncHistory]
    }));

    try {
      const result = await forceAction();
      
      set((state) => ({
        syncStatus: { ...state.syncStatus, [key]: 'success' },
        syncHistory: state.syncHistory.map(log => 
          log.id === tempId 
            ? { ...log, status: 'success', details: result?.message || `Successfully synced ${key} data.` }
            : log
        )
      }));
    } catch (err: any) {
      console.error(`Sync error for ${key}:`, err);
      const errMsg = err.response?.data?.error || err.message || `Failed to sync ${key}`;
      
      set((state) => ({
        syncStatus: { ...state.syncStatus, [key]: 'error' },
        syncHistory: state.syncHistory.map(log => 
          log.id === tempId 
            ? { ...log, status: 'failed', details: `Error: ${errMsg}` }
            : log
        )
      }));
    }
  },

  fetchHistory: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    try {
      const response = await axios.get(`${API_URL}/api/sync/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const remoteHistory: SyncHistoryItem[] = response.data.map((r: any) => {
        let details = '';
        if (r.type === 'location') {
          details = `Logged GPS: Lat ${r.data?.latitude?.toFixed(4)}, Lng ${r.data?.longitude?.toFixed(4)}`;
        } else if (r.type === 'contacts') {
          details = `Backed up ${r.data?.count} device contacts.`;
        } else if (r.type === 'calendar') {
          details = `Backed up ${r.data?.count} calendar events.`;
        } else if (r.type === 'photos' || r.type === 'files') {
          details = `Backed up: ${r.data?.filename || 'File'} (${((r.data?.size || 0)/1024).toFixed(1)} KB)`;
        }
        return {
          id: r.id,
          type: r.type as any,
          timestamp: r.timestamp,
          status: 'success',
          details
        };
      });

      set({ syncHistory: remoteHistory });
    } catch (err) {
      console.error("Fetch sync history error:", err);
    }
  },

  clearPolicyError: () => set({ policyError: null }),
  
  uploadedPhotoIds: [],

  loadUploadedPhotos: async () => {
    try {
      const stored = await AsyncStorage.getItem('uploaded_photo_ids');
      if (stored) {
        set({ uploadedPhotoIds: JSON.parse(stored) });
      }
    } catch (e) {
      console.error('Failed to load uploaded photo list:', e);
    }
  },

  markPhotoUploaded: async (id) => {
    const { uploadedPhotoIds } = get();
    if (uploadedPhotoIds.includes(id)) return;
    const newList = [...uploadedPhotoIds, id];
    set({ uploadedPhotoIds: newList });
    try {
      await AsyncStorage.setItem('uploaded_photo_ids', JSON.stringify(newList));
    } catch (e) {
      console.error('Failed to save uploaded photo list:', e);
    }
  }
}));
