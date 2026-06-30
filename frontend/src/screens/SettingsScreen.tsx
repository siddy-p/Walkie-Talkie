import React, { useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  Modal, SafeAreaView, StatusBar, Image, TextInput,
  Alert, Clipboard, Platform, ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useSyncStore, SyncHistoryItem } from '../state/syncStore';
import { useAuthStore } from '../state/authStore';
import api from '../services/api';
import {
  User, Bell, Lock, ChevronRight, LogOut, Pencil,
  Shield, ShieldAlert, Clock, Info, Database, Check, X, Copy, QrCode
} from 'lucide-react-native';

export default function SettingsScreen() {
  const { syncEnabled, syncHistory, policyError, setSyncEnabled, fetchHistory, clearPolicyError } = useSyncStore();
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  // Profile edit state
  const [editingName, setEditingName] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [status, setStatus] = useState('Hey there! I am using Walkie-Talkie.');
  const [tempName, setTempName] = useState('');
  const [tempStatus, setTempStatus] = useState('');

  // Admin modal
  const [modalVisible, setModalVisible] = useState(false);
  const [blockedFeature, setBlockedFeature] = useState('');

  // Load persistent profile data on mount or when user changes
  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) return;
      try {
        const storedName = await AsyncStorage.getItem(`custom_name_${user.id}`);
        const storedStatus = await AsyncStorage.getItem(`custom_status_${user.id}`);
        if (storedName) setDisplayName(storedName);
        if (storedStatus) setStatus(storedStatus);
      } catch (err) {
        console.warn('Error loading custom name/status:', err);
      }
    }
    loadProfile();

    if (isAdmin) {
      fetchHistory();
      const interval = setInterval(() => fetchHistory(), 10000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  useEffect(() => {
    if (policyError) setModalVisible(true);
  }, [policyError]);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() }
    ]);
  };

  const startEditName = () => {
    setTempName(displayName);
    setEditingName(true);
  };

  const saveName = async () => {
    const trimmed = tempName.trim();
    if (trimmed && user?.id) {
      setDisplayName(trimmed);
      try {
        await AsyncStorage.setItem(`custom_name_${user.id}`, trimmed);
        
        // Persist to backend database so other users see the update
        await api.post('/api/auth/update-profile', { displayName: trimmed });

        // Update local authStore state
        useAuthStore.setState({
          user: user ? { ...user, displayName: trimmed } : null
        });
      } catch (err) {
        console.warn('Error saving custom name:', err);
      }
    }
    setEditingName(false);
  };

  const startEditStatus = () => {
    setTempStatus(status);
    setEditingStatus(true);
  };

  const saveStatus = async () => {
    const trimmed = tempStatus.trim();
    if (trimmed && user?.id) {
      setStatus(trimmed);
      try {
        await AsyncStorage.setItem(`custom_status_${user.id}`, trimmed);
      } catch (err) {
        console.warn('Error saving custom status:', err);
      }
    }
    setEditingStatus(false);
  };

  const changeAvatar = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setUploadingAvatar(true);

      const formData = new FormData();
      formData.append('avatar', {
        uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
        name: asset.name,
        type: asset.mimeType || 'image/jpeg',
      } as any);

      const res = await api.post('/api/auth/upload-avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (res.data?.success && res.data?.avatarUrl) {
        // Update local authStore state
        useAuthStore.setState({
          user: user ? { ...user, avatarUrl: res.data.avatarUrl } : null,
        });
        Alert.alert('Success', 'Profile picture updated successfully!');
      }
    } catch (err) {
      console.warn('Error uploading avatar:', err);
      Alert.alert('Upload Failed', 'Failed to upload profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const renderHistoryItem = ({ item }: { item: SyncHistoryItem }) => {
    const colors: Record<string, string> = {
      contacts: '#3b82f6', location: '#ef4444',
      calendar: '#10b981', photos: '#a855f7', files: '#f59e0b'
    };
    const typeColor = colors[item.type] || '#3b82f6';
    return (
      <View style={styles.historyCard}>
        <View style={styles.historyHeader}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '20' }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>{item.type.toUpperCase()}</Text>
          </View>
          <Text style={styles.historyTime}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
        </View>
        <Text style={styles.historyDetails}>{item.details}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Profile Card ── */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrapper}>
            <Image
              source={{ uri: user?.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user?.username}` }}
              style={styles.avatar}
            />
            <TouchableOpacity 
              style={styles.avatarEditBtn} 
              activeOpacity={0.8}
              onPress={changeAvatar}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.8 }] }} />
              ) : (
                <Pencil size={12} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Display Name */}
          <View style={styles.profileNameRow}>
            {editingName ? (
              <View style={styles.inlineEditRow}>
                <TextInput
                  style={styles.inlineInput}
                  value={tempName}
                  onChangeText={setTempName}
                  autoFocus
                  selectionColor="#25d366"
                  placeholderTextColor="#475569"
                />
                <TouchableOpacity onPress={saveName} style={styles.inlineAction}>
                  <Check size={18} color="#25d366" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingName(false)} style={styles.inlineAction}>
                  <X size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.profileNameTap} onPress={startEditName} activeOpacity={0.7}>
                <Text style={styles.profileName}>{displayName}</Text>
                <Pencil size={14} color="#25d366" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            )}
          </View>

          {/* Status */}
          <View style={styles.profileStatusRow}>
            {editingStatus ? (
              <View style={styles.inlineEditRow}>
                <TextInput
                  style={styles.inlineInput}
                  value={tempStatus}
                  onChangeText={setTempStatus}
                  autoFocus
                  selectionColor="#25d366"
                  multiline
                  placeholderTextColor="#475569"
                />
                <TouchableOpacity onPress={saveStatus} style={styles.inlineAction}>
                  <Check size={18} color="#25d366" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingStatus(false)} style={styles.inlineAction}>
                  <X size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.profileNameTap} onPress={startEditStatus} activeOpacity={0.7}>
                <Text style={styles.profileStatus}>{status}</Text>
                <Pencil size={12} color="#475569" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.profileUsername}>@{user?.username}</Text>

          {/* UUID / Tag share card */}
          <View style={styles.idCard}>
            <View style={styles.idRow}>
              <Text style={styles.idLabel}>Tag</Text>
              <Text style={styles.idValue}>@{user?.username}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={() => {
                Clipboard.setString('@' + user?.username);
                Alert.alert('Copied', 'Your tag has been copied to clipboard.');
              }}>
                <Copy size={14} color="#25d366" />
              </TouchableOpacity>
            </View>
            <View style={styles.idDivider} />
            <View style={styles.idRow}>
              <Text style={styles.idLabel}>UUID</Text>
              <Text style={styles.idValue} numberOfLines={1} ellipsizeMode="middle">{(user as any)?.uuid || user?.id}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={() => {
                Clipboard.setString((user as any)?.uuid || user?.id || '');
                Alert.alert('Copied', 'Your UUID has been copied to clipboard.');
              }}>
                <Copy size={14} color="#25d366" />
              </TouchableOpacity>
            </View>
            <Text style={styles.idHint}>Share your tag or UUID to let others find you</Text>
          </View>
        </View>

        {/* ── Account Section ── */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.menuCard}>
          <SettingsRow 
            icon={<User size={20} color="#25d366" />} 
            label="Profile Info" 
            subtitle="Name, avatar, status" 
            onPress={() => {
              Alert.alert(
                'Profile Details',
                `Display Name: ${displayName}\nUsername: @${user?.username}\nUUID: ${(user as any)?.uuid || user?.id || ''}\nRole: ${user?.role || 'User'}`,
                [{ text: 'OK' }]
              );
            }}
          />
          <SettingsRow 
            icon={<Lock size={20} color="#25d366" />} 
            label="Privacy" 
            subtitle="Last seen, read receipts" 
            onPress={() => {
              Alert.alert(
                'Privacy Controls',
                'Your chat end-to-end encryption is active. Read receipts and Online Status are synchronized with server logs to remain compliant.',
                [{ text: 'Close', style: 'cancel' }]
              );
            }}
          />
          <SettingsRow 
            icon={<Bell size={20} color="#25d366" />} 
            label="Notifications" 
            subtitle="Message, group, call tones" 
            last 
            onPress={() => {
              Alert.alert(
                'Notification Settings',
                'Message sound, alert banners, and device vibration are active and optimized for real-time compliance sync.',
                [{ text: 'OK' }]
              );
            }}
          />
        </View>

        {/* ── Admin-only: Sync + Logs ── */}
        {isAdmin && (
          <>

            <Text style={styles.sectionLabel}>ADMIN — DATABASE</Text>
            <View style={styles.menuCard}>
              <TouchableOpacity style={styles.menuRow} activeOpacity={0.7}
                onPress={() => { setBlockedFeature('DATA RETENTION DELETE'); setModalVisible(true); }}>
                <Database size={18} color="#ef4444" />
                <Text style={[styles.menuLabel, { color: '#fca5a5' }]}>Clear Database Logs</Text>
                <ChevronRight size={16} color="#475569" />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>BACKGROUND SYNC LOGS</Text>
            {syncHistory.length === 0 ? (
              <View style={styles.emptyLogsCard}>
                <Info size={22} color="#475569" />
                <Text style={styles.emptyLogsText}>No logs yet.</Text>
              </View>
            ) : (
              syncHistory.map(item => (
                <View key={item.id}>{renderHistoryItem({ item })}</View>
              ))
            )}
          </>
        )}

        {/* ── Log Out ── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <LogOut size={18} color="#ef4444" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Admin policy modal */}
      <Modal animationType="slide" transparent visible={modalVisible}
        onRequestClose={() => { setModalVisible(false); clearPolicyError(); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ShieldAlert size={48} color="#ef4444" style={{ marginBottom: 16 }} />
            <Text style={styles.modalTitle}>Action Blocked</Text>
            <Text style={styles.modalText}>
              {blockedFeature === 'DATA RETENTION DELETE'
                ? 'Deleting communication history is blocked by administrative retention protocols.'
                : `Disabling [${blockedFeature}] sync daemon is denied by security policy.`}
            </Text>
            <TouchableOpacity style={styles.modalCloseBtn} activeOpacity={0.8}
              onPress={() => { setModalVisible(false); clearPolicyError(); }}>
              <Text style={styles.modalCloseBtnText}>ACKNOWLEDGE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Reusable row component ──────────────────────────────────────────────────
function SettingsRow({ icon, label, subtitle, last, onPress }: {
  icon: React.ReactNode; label: string; subtitle?: string; last?: boolean; onPress?: () => void;
}) {
  return (
    <TouchableOpacity 
      style={[styles.menuRow, !last && styles.menuRowBorder]} 
      activeOpacity={0.6}
      onPress={onPress}
    >
      <View style={styles.menuIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtitle && <Text style={styles.menuSub}>{subtitle}</Text>}
      </View>
      <ChevronRight size={16} color="#334155" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#111b21',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  topBar: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  topBarTitle: { fontSize: 22, fontWeight: '800', color: '#e9edef' },

  scrollContent: { paddingBottom: 120 },

  // Profile
  profileCard: {
    alignItems: 'center', paddingVertical: 32,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
    marginBottom: 8,
  },
  avatarWrapper: { position: 'relative', marginBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#1f2c34' },
  avatarEditBtn: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#25d366', borderRadius: 16, padding: 6,
    borderWidth: 2, borderColor: '#111b21',
  },
  profileNameRow: { marginBottom: 4 },
  profileNameTap: { flexDirection: 'row', alignItems: 'center' },
  profileName: { fontSize: 22, fontWeight: '700', color: '#e9edef' },
  profileStatusRow: { marginBottom: 6 },
  profileStatus: { fontSize: 14, color: '#8696a0', textAlign: 'center', maxWidth: 260 },
  profileUsername: { fontSize: 12, color: '#3b4a54', fontWeight: '600' },

  inlineEditRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#25d366',
    paddingBottom: 2, minWidth: 220,
  },
  inlineInput: { flex: 1, fontSize: 18, color: '#e9edef', paddingVertical: 2 },
  inlineAction: { paddingHorizontal: 8 },

  // Sections
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#8696a0',
    letterSpacing: 1.2, paddingHorizontal: 20,
    marginTop: 24, marginBottom: 4,
  },
  menuCard: {
    backgroundColor: '#1f2c34',
    marginHorizontal: 0,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 20,
    gap: 16,
  },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  menuIcon: { width: 24, alignItems: 'center' },
  menuLabel: { fontSize: 15, color: '#e9edef', fontWeight: '500', flex: 1 },
  menuSub: { fontSize: 12, color: '#8696a0', marginTop: 1 },

  // Sync badge
  syncBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  syncBadgeText: { fontSize: 11, fontWeight: '800' },

  // Logs
  emptyLogsCard: {
    marginHorizontal: 20, marginTop: 8,
    backgroundColor: '#1f2c34', borderRadius: 12,
    paddingVertical: 24, alignItems: 'center', gap: 8,
  },
  emptyLogsText: { color: '#475569', fontSize: 13 },
  historyCard: {
    marginHorizontal: 20, marginTop: 6,
    backgroundColor: '#1f2c34', borderRadius: 10, padding: 12,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  historyTime: { fontSize: 10, color: '#475569' },
  historyDetails: { color: '#e9edef', fontSize: 12, lineHeight: 16 },

  // ID share card
  idCard: {
    marginTop: 16, backgroundColor: '#1f2c34',
    borderRadius: 14, padding: 14, width: '88%',
    borderWidth: 1, borderColor: 'rgba(37,211,102,0.15)',
  },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  idLabel: { fontSize: 11, fontWeight: '800', color: '#25d366', width: 38, letterSpacing: 0.5 },
  idValue: { flex: 1, fontSize: 12, color: '#e9edef', fontFamily: 'monospace' },
  copyBtn: { padding: 6, backgroundColor: 'rgba(37,211,102,0.1)', borderRadius: 8 },
  idDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 8 },
  idHint: { fontSize: 11, color: '#3b4a54', marginTop: 8, textAlign: 'center' },

  // Log out
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginTop: 32, gap: 10,
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#ef4444' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalContent: {
    backgroundColor: '#1f2c34', borderRadius: 20, padding: 28,
    alignItems: 'center', width: '100%', maxWidth: 360,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#e9edef', marginBottom: 10 },
  modalText: { fontSize: 13, color: '#8696a0', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  modalCloseBtn: {
    backgroundColor: '#ef4444', paddingVertical: 12,
    paddingHorizontal: 24, borderRadius: 10, width: '100%', alignItems: 'center',
  },
  modalCloseBtnText: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
});
