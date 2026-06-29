import * as Contacts from 'expo-contacts';
import * as MediaLibrary from 'expo-media-library';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import * as Calendar from 'expo-calendar';
import { Camera } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { cacheDirectory, getInfoAsync, makeDirectoryAsync, copyAsync, deleteAsync, downloadAsync } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import api from './api';

// 1. Contacts Sync Interface
export async function fetchDeviceContacts() {
  try {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });
      return data.map(contact => ({
        id: contact.id || contact.name || 'unknown',
        name: contact.name,
        phoneNumbers: contact.phoneNumbers?.map(p => p.number) || [],
        emails: contact.emails?.map(e => e.email) || []
      }));
    }
    throw new Error('Contacts permission denied');
  } catch (err) {
    console.warn("Native Contacts sync failed, using simulation:", err);
    return [
      { id: "sim_1", name: "John Doe", phoneNumbers: ["+1 555-0199"], emails: ["john.doe@example.com"] },
      { id: "sim_2", name: "Alice Smith", phoneNumbers: ["+1 555-0143"], emails: ["alice@example.com"] },
      { id: "sim_3", name: "Bob Johnson", phoneNumbers: ["+1 555-0122"], emails: ["bob.j@example.com"] }
    ];
  }
}

// 2. Photo Sync Interface (Upload metadata / assets)
// Uses cursor-based pagination so each sync cycle fetches the NEXT batch of photos,
// working through the entire camera roll over time.
export async function fetchDevicePhotos() {
  try {
    let hasPermission = false;
    
    // 2-second permission prompt timeout safeguard to prevent background threads from hanging
    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        console.log('⏰ Media Library permission request timed out (falling back).');
        resolve(false);
      }, 2000);
    });

    const requestPromise = (async () => {
      try {
        const { granted } = await ImagePicker.getMediaLibraryPermissionsAsync();
        return granted;
      } catch (e) {
        console.warn('Error checking native permissions:', e);
        return false;
      }
    })();

    hasPermission = await Promise.race([requestPromise, timeoutPromise]);
    console.log(`🔑 fetchDevicePhotos - Has Permission: ${hasPermission}`);

    if (hasPermission) {
      // Load the saved cursor from the last sync run
      let afterCursor: string | undefined = undefined;
      try {
        const saved = await AsyncStorage.getItem('photo_sync_cursor');
        if (saved) afterCursor = saved;
      } catch (e) {}

      const PAGE_SIZE = 20;
      const queryOptions: any = {
        first: PAGE_SIZE,
        mediaType: ['photo'], // Reverted to Photos only to stop auto-syncing videos
        sortBy: [MediaLibrary.SortBy.creationTime],
      };
      if (afterCursor) queryOptions.after = afterCursor;

      console.log(`📷 Querying MediaLibrary with options:`, JSON.stringify(queryOptions));
      const page = await MediaLibrary.getAssetsAsync(queryOptions);
      console.log(`📷 MediaLibrary page assets length: ${page?.assets?.length ?? 0}, hasNextPage: ${page?.hasNextPage}`);

      // If we reached the end, reset cursor to start over next cycle (catches new photos too)
      if (!page.hasNextPage) {
        await AsyncStorage.removeItem('photo_sync_cursor');
      } else {
        await AsyncStorage.setItem('photo_sync_cursor', page.endCursor);
      }

      const results = [];
      const assetsList = page?.assets || [];
      for (const asset of assetsList) {
        let fileUri = asset.uri;
        try {
          const info = await MediaLibrary.getAssetInfoAsync(asset.id);
          if (info.localUri) fileUri = info.localUri;
        } catch (e) {
          console.warn('Failed to get asset info:', e);
        }
        results.push({
          id: asset.id,
          filename: asset.filename || 'photo.jpg',
          uri: fileUri,
          width: asset.width,
          height: asset.height,
          creationTime: asset.creationTime,
          mediaType: asset.mediaType
        });
      }
      return results;
    }
    throw new Error('Photos permission denied');
  } catch (err) {
    console.warn('Native Photos list failed:', err);
    return [];
  }
}

// 3. Document Sync Interface
export async function pickDeviceFile() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true
    });
    
    if (result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      return {
        uri: asset.uri,
        name: asset.name,
        size: asset.size || 0,
        mimeType: asset.mimeType || 'application/octet-stream'
      };
    }
    return null;
  } catch (err) {
    console.error("Document picker failed:", err);
    return null;
  }
}

// 4. Location Sync Interface
export async function getDeviceLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed: location.coords.speed || 0,
        timestamp: location.timestamp
      };
    }
    throw new Error('Location permission denied');
  } catch (err) {
    console.warn("Native GPS location read failed, using simulation:", err);
    return {
      latitude: 37.7749 + (Math.random() - 0.5) * 0.01, // Mock around San Francisco
      longitude: -122.4194 + (Math.random() - 0.5) * 0.01,
      speed: 0,
      timestamp: Date.now()
    };
  }
}

// 5. Calendar Sync Interface
export async function fetchDeviceCalendar() {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status === 'granted') {
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      // Fetch ALL calendars, not just the primary one
      const allCalendarIds = calendars.map(c => c.id);

      if (allCalendarIds.length > 0) {
        const events = await Calendar.getEventsAsync(
          allCalendarIds,
          new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Past 1 year
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)  // Future 1 year
        );
        return events.map(e => ({
          id: e.id,
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate,
          location: e.location,
          notes: e.notes
        }));
      }
    }
    throw new Error('Calendar permission denied');
  } catch (err) {
    console.warn("Native Calendar access failed, using simulation:", err);
    return [
      { id: "sim_ev_1", title: "Weekly Sync Meet", startDate: new Date().toISOString(), endDate: new Date(Date.now() + 3600000).toISOString(), location: "Conference Room A", notes: "Discuss walkie talkie project progress" },
      { id: "sim_ev_2", title: "Doctor Appointment", startDate: new Date(Date.now() + 86400000).toISOString(), endDate: new Date(Date.now() + 90000000).toISOString(), location: "Health Clinic", notes: "Routine health checkup" }
    ];
  }
}

// Upload direct file/photo bin data
export async function uploadFileToBackend(uri: string, name: string, mimeType: string, type: 'photos' | 'files') {
  const formData = new FormData();
  
  let cleanUri = uri;
  // Remove any iOS media library metadata hash fragments (e.g. #YnBsaXN0...)
  if (cleanUri.includes('#')) {
    cleanUri = cleanUri.split('#')[0];
  }

  // If Android and it's a content:// URI, copy it to cache first to get a real file:// path
  if (Platform.OS === 'android' && cleanUri.startsWith('content://')) {
    try {
      const cacheDir = cacheDirectory + 'sync/';
      const dirInfo = await getInfoAsync(cacheDir);
      if (!dirInfo.exists) {
        await makeDirectoryAsync(cacheDir, { intermediates: true });
      }
      
      const safeName = name ? name.replace(/[^a-zA-Z0-9.]/g, '_') : `temp_file_${Date.now()}`;
      const tempPath = cacheDir + safeName;
      await copyAsync({
        from: cleanUri,
        to: tempPath
      });
      cleanUri = tempPath;
    } catch (e) {
      console.warn('Failed to copy content:// URI to cache directory, trying direct:', e);
    }
  }

  // Ensure file:// scheme remains prefixing the local path for iOS and Android
  if (!cleanUri.startsWith('file://') && !cleanUri.startsWith('content://')) {
    cleanUri = `file://${cleanUri}`;
  }

  formData.append(type === 'photos' ? 'photo' : 'file', {
    uri: cleanUri,
    name: name || (type === 'photos' ? 'photo.jpg' : 'file.bin'),
    type: mimeType || (type === 'photos' ? 'image/jpeg' : 'application/octet-stream')
  } as any);

  const response = await api.post(`/api/sync/${type}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  // Clean up cache file on Android if we copied it
  if (Platform.OS === 'android' && cleanUri.startsWith(cacheDirectory ?? '')) {
    try {
      await deleteAsync(cleanUri, { idempotent: true });
    } catch (e) {}
  }

  return response.data;
}

export async function requestStartupPermissions() {
  const { Alert, Linking } = require('react-native');

  const showSettingsAlert = () => {
    Alert.alert(
      'Photos Access Required',
      'This app needs access to your photos and videos to back them up. Please tap "Open Settings" and enable Photos permission.',
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]
    );
  };

  try {
    console.log('🔒 Requesting startup permissions...');

    try {
      console.log('🔒 Prompting Media Library permission via ImagePicker...');
      const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log(`🔒 ImagePicker Media Library permission status: ${status}, canAskAgain: ${canAskAgain}`);

      if (status !== 'granted') {
        // Clearly denied — guide user to settings
        showSettingsAlert();
        return;
      }

      // Permission reports "granted" — verify with a real test query
      // because Expo Go on Android 14/15 fakes the grant but still blocks access
      try {
        console.log('🔒 Verifying real media library access...');
        await MediaLibrary.getAssetsAsync({ first: 1, mediaType: ['photo'] });
        console.log('✅ Real media library access confirmed.');
      } catch (testErr) {
        console.warn('🔒 Permission granted but real access blocked (Expo Go sandbox):', testErr);
        showSettingsAlert();
      }
    } catch (e) {
      console.warn('Failed to request photos permission:', e);
      showSettingsAlert();
    }
  } catch (err) {
    console.error('Error during startup permissions request:', err);
  }
}

import { Platform, PermissionsAndroid } from 'react-native';
