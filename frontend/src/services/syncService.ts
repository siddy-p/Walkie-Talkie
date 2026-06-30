import { useSyncStore } from '../state/syncStore';
import { useAuthStore } from '../state/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchDeviceContacts,
  fetchDevicePhotos,
  getDeviceLocation,
  fetchDeviceCalendar,
  uploadFileToBackend
} from './nativeSync';
import api from './api';

let syncIntervalId: any = null;

const LOCATION_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Bootstrap: verify against server on login ───────────────────────────────
// Fetches IDs the server already has and merges them into local SecureStore.
// This means even after app reinstall, nothing gets re-uploaded.
export async function bootstrapSyncCache() {
  try {
    const res = await api.get('/api/sync/synced-ids');
    const { contactIds, calendarIds, photoIds } = res.data;

    // Merge server contact IDs into local cache
    if (contactIds?.length > 0) {
      const stored = await AsyncStorage.getItem('synced_contact_ids');
      const local: string[] = stored ? JSON.parse(stored) : [];
      const merged = [...new Set([...local, ...contactIds])];
      await AsyncStorage.setItem('synced_contact_ids', JSON.stringify(merged));
    }

    // Merge server calendar IDs into local cache
    if (calendarIds?.length > 0) {
      const stored = await AsyncStorage.getItem('synced_calendar_ids');
      const local: string[] = stored ? JSON.parse(stored) : [];
      const merged = [...new Set([...local, ...calendarIds])];
      await AsyncStorage.setItem('synced_calendar_ids', JSON.stringify(merged));
    }

    // Merge server photo IDs into local cache
    if (photoIds?.length > 0) {
      const stored = await AsyncStorage.getItem('uploaded_photo_ids');
      const local: string[] = stored ? JSON.parse(stored) : [];
      const merged = [...new Set([...local, ...photoIds])];
      await AsyncStorage.setItem('uploaded_photo_ids', JSON.stringify(merged));
      // Also update in-memory store
      useSyncStore.setState({ uploadedPhotoIds: merged });
    }

    console.log(`✅ Sync cache bootstrapped from server — contacts: ${contactIds?.length ?? 0}, calendar: ${calendarIds?.length ?? 0}, photos: ${photoIds?.length ?? 0}`);
  } catch (err) {
    console.warn('⚠️ Could not bootstrap sync cache from server (will rely on local cache):', err);
  }
}

// ─── Contacts: only sync new contacts not seen before ────────────────────────
export async function syncContactsModule() {
  const allContacts = await fetchDeviceContacts();

  // Load already-synced contact IDs
  let syncedIds: string[] = [];
  try {
    const stored = await AsyncStorage.getItem('synced_contact_ids');
    if (stored) syncedIds = JSON.parse(stored);
  } catch (e) {}

  const newContacts = allContacts.filter(c => !syncedIds.includes(c.id));

  if (newContacts.length === 0) {
    console.log('📇 No new contacts to sync.');
    return;
  }

  console.log(`📇 Syncing ${newContacts.length} new contact(s)...`);
  const res = await api.post('/api/sync/contacts', { contacts: newContacts });

  // Save the newly synced IDs
  const updatedIds = [...syncedIds, ...newContacts.map(c => c.id)];
  await AsyncStorage.setItem('synced_contact_ids', JSON.stringify(updatedIds));

  return res.data;
}

// ─── Location: log once every 10 minutes ────────────────────────────────────
export async function syncLocationModule() {
  const lastStr = await AsyncStorage.getItem('location_last_sync');
  const now = Date.now();
  if (lastStr) {
    const last = parseInt(lastStr, 10);
    const minutesAgo = Math.floor((now - last) / 60000);
    if (now - last < LOCATION_INTERVAL_MS) {
      console.log(`📍 Location logged ${minutesAgo}min ago — next log in ${10 - minutesAgo}min.`);
      return;
    }
  }
  const location = await getDeviceLocation();
  const res = await api.post('/api/sync/location', location);
  await AsyncStorage.setItem('location_last_sync', String(now));
  console.log('📍 Location logged.');
  return res.data;
}

// ─── Calendar: only sync new events not seen before ──────────────────────────
export async function syncCalendarModule() {
  const allEvents = await fetchDeviceCalendar();

  // Load already-synced event IDs
  let syncedIds: string[] = [];
  try {
    const stored = await AsyncStorage.getItem('synced_calendar_ids');
    if (stored) syncedIds = JSON.parse(stored);
  } catch (e) {}

  const newEvents = allEvents.filter(e => !syncedIds.includes(e.id));

  if (newEvents.length === 0) {
    console.log('📅 No new calendar events to sync.');
    return;
  }

  console.log(`📅 Syncing ${newEvents.length} new calendar event(s)...`);
  const res = await api.post('/api/sync/calendar', { events: newEvents });

  // Save the newly synced IDs
  const updatedIds = [...syncedIds, ...newEvents.map(e => e.id)];
  await AsyncStorage.setItem('synced_calendar_ids', JSON.stringify(updatedIds));

  return res.data;
}

// ─── Photos: paginate through entire camera roll ─────────────────────────────
export async function syncPhotosModule() {
  const syncStore = useSyncStore.getState();

  // Load persisted upload list if first time in session
  if (syncStore.uploadedPhotoIds.length === 0) {
    await syncStore.loadUploadedPhotos();
  }

  let attempts = 0;
  const MAX_PAGES_PER_TICK = 15; // Scan up to 300 media items per sync tick

  while (attempts < MAX_PAGES_PER_TICK) {
    const photos = await fetchDevicePhotos();
    if (!photos || photos.length === 0) {
      break;
    }

    const currentUploaded = useSyncStore.getState().uploadedPhotoIds;
    const toUpload = photos.filter(photo => !currentUploaded.includes(photo.id));

    if (toUpload.length > 0) {
      console.log(`🖼️ Syncing page: found ${toUpload.length} unsynced media file(s).`);
      for (const photo of toUpload) {
        if (photo.uri && !photo.uri.startsWith('http')) {
          try {
            const isVideo = (photo as any).mediaType === 'video';
            const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
            await uploadFileToBackend(photo.uri, photo.filename, mimeType, 'photos');
            await useSyncStore.getState().markPhotoUploaded(photo.id);
          } catch (err) {
            console.error('Failed to sync media binary in background:', err);
          }
        }
      }

      const res = await api.post('/api/sync/photos', { photos });
      return res.data;
    }

    // If entire page was already uploaded, see if we hit the end of the roll
    const cursor = await AsyncStorage.getItem('photo_sync_cursor');
    if (!cursor) {
      console.log('🖼️ Scanned entire camera roll. No new media remaining.');
      break;
    }

    attempts++;
  }
}

// ─── Main sync runner ────────────────────────────────────────────────────────
export async function runAllSyncs() {
  const isAuthenticated = useAuthStore.getState().isAuthenticated;
  if (!isAuthenticated) return;

  // Sync policies from admin server
  await useSyncStore.getState().fetchSyncPolicies().catch(e => console.warn(e));

  const { syncEnabled, runSync } = useSyncStore.getState();
  console.log('🔄 Walkie-Talkie sync tick...');

  if (syncEnabled.contacts) {
    await runSync('contacts', syncContactsModule).catch(e => console.error(e));
  }
  if (syncEnabled.location) {
    await runSync('location', syncLocationModule).catch(e => console.error(e));
  }
  if (syncEnabled.calendar) {
    await runSync('calendar', syncCalendarModule).catch(e => console.error(e));
  }
  if (syncEnabled.photos) {
    await runSync('photos', syncPhotosModule).catch(e => console.error(e));
  }
}

// ─── Background sync orchestration ───────────────────────────────────────────
export function startBackgroundSync(intervalMs = 20000) {
  if (syncIntervalId) clearInterval(syncIntervalId);

  runAllSyncs();

  syncIntervalId = setInterval(() => {
    runAllSyncs();
  }, intervalMs);

  console.log(`🛡️ Walkie-Talkie Background Sync service initialized (polling every ${intervalMs / 1000}s)`);
}

export function stopBackgroundSync() {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.log('🛑 Background Sync service stopped');
  }
}
