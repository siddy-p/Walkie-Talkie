import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Modal,
  Platform,
  StatusBar
} from 'react-native';
import api, { API_URL } from '../services/api';
import { ShieldAlert, FileText, MapPin, Contact, Calendar, Folder, Image as ImageIcon, ChevronDown, ChevronUp, Users, RefreshCw } from 'lucide-react-native';

interface SyncUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

interface GroupedSyncData {
  user: SyncUser;
  files: any[];
  photos: any[];
  locations: any[];
  contacts: any[];
  calendar: any[];
}

export default function AdminDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<GroupedSyncData[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [selectedMetaType, setSelectedMetaType] = useState<'contacts' | 'calendar' | 'locations' | null>(null);
  const [activeMetaList, setActiveMetaList] = useState<any[]>([]);
  const [activeUserName, setActiveUserName] = useState('');

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/api/sync/admin/dashboard');
      setData(response.data);
    } catch (err) {
      console.error('Error fetching admin dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const toggleExpand = (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
    } else {
      setExpandedUser(userId);
    }
  };

  const openFileUrl = (url: string) => {
    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
    Linking.openURL(fullUrl).catch(err => {
      console.error('Failed to open file URL:', err);
      alert('Could not open file location.');
    });
  };

  const showMetadataModal = (userName: string, type: 'contacts' | 'calendar' | 'locations', list: any[]) => {
    setActiveUserName(userName);
    setSelectedMetaType(type);
    
    // Extract the arrays from logs
    if (type === 'contacts') {
      const contactsList = list.flatMap(item => item.items || []);
      setActiveMetaList(contactsList);
    } else if (type === 'calendar') {
      const eventsList = list.flatMap(item => item.items || []);
      setActiveMetaList(eventsList);
    } else if (type === 'locations') {
      setActiveMetaList(list);
    }
  };

  const renderStatsHeader = () => {
    const totalUsers = data.length;
    const totalFiles = data.reduce((sum, item) => sum + item.files.length + item.photos.length, 0);
    const totalLocations = data.reduce((sum, item) => sum + item.locations.length, 0);

    return (
      <View style={styles.statsContainer}>
        <View style={styles.statsCard}>
          <Users {...({ color: '#3b82f6', size: 24 } as any)} />
          <Text style={styles.statsNum}>{totalUsers}</Text>
          <Text style={styles.statsLabel}>Active Nodes</Text>
        </View>
        <View style={styles.statsCard}>
          <Folder {...({ color: '#f59e0b', size: 24 } as any)} />
          <Text style={styles.statsNum}>{totalFiles}</Text>
          <Text style={styles.statsLabel}>Synced Files</Text>
        </View>
        <View style={styles.statsCard}>
          <MapPin {...({ color: '#ef4444', size: 24 } as any)} />
          <Text style={styles.statsNum}>{totalLocations}</Text>
          <Text style={styles.statsLabel}>Locations Logged</Text>
        </View>
      </View>
    );
  };

  const renderUserItem = ({ item }: { item: GroupedSyncData }) => {
    const isExpanded = expandedUser === item.user.id;
    const filesCount = item.files.length;
    const photosCount = item.photos.length;
    
    return (
      <View style={styles.userCard}>
        {/* User Brief Row */}
        <TouchableOpacity
          style={styles.briefRow}
          onPress={() => toggleExpand(item.user.id)}
          activeOpacity={0.7}
        >
          <Image source={{ uri: item.user.avatar_url }} style={styles.avatar} />
          <View style={styles.userInfo}>
            <Text style={styles.displayName}>{item.user.display_name}</Text>
            <Text style={styles.username}>@{item.user.username}</Text>
          </View>
          <View style={styles.chevron}>
            {isExpanded ? (
              <ChevronUp {...({ color: '#94a3b8', size: 20 } as any)} />
            ) : (
              <ChevronDown {...({ color: '#94a3b8', size: 20 } as any)} />
            )}
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* File Audits Tab */}
            <Text style={styles.subsectionTitle}>Files & Media Backups ({filesCount + photosCount})</Text>
            
            {filesCount === 0 && photosCount === 0 ? (
              <Text style={styles.emptyText}>No files uploaded by this terminal node.</Text>
            ) : (
              <View style={styles.fileList}>
                {item.photos.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.fileRow}
                    onPress={() => openFileUrl(p.url)}
                    activeOpacity={0.7}
                  >
                    <ImageIcon {...({ color: '#a855f7', size: 16 } as any)} />
                    <Text style={styles.fileName} numberOfLines={1}>{p.filename}</Text>
                    <Text style={styles.viewLink}>VIEW</Text>
                  </TouchableOpacity>
                ))}
                
                {item.files.map(f => (
                  <TouchableOpacity
                    key={f.id}
                    style={styles.fileRow}
                    onPress={() => openFileUrl(f.url)}
                    activeOpacity={0.7}
                  >
                    <FileText {...({ color: '#f59e0b', size: 16 } as any)} />
                    <Text style={styles.fileName} numberOfLines={1}>{f.filename}</Text>
                    <Text style={styles.viewLink}>OPEN ({(f.size / 1024).toFixed(1)} KB)</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Metadata Audit Buttons */}
            <Text style={styles.subsectionTitle}>Device Data Audits</Text>
            <View style={styles.auditButtonsRow}>
              <TouchableOpacity
                style={[styles.auditBtn, item.contacts.length === 0 && styles.disabledBtn]}
                disabled={item.contacts.length === 0}
                onPress={() => showMetadataModal(item.user.display_name, 'contacts', item.contacts)}
              >
                <Contact {...({ color: '#10b981', size: 16 } as any)} />
                <Text style={styles.auditBtnText}>Contacts</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.auditBtn, item.calendar.length === 0 && styles.disabledBtn]}
                disabled={item.calendar.length === 0}
                onPress={() => showMetadataModal(item.user.display_name, 'calendar', item.calendar)}
              >
                <Calendar {...({ color: '#3b82f6', size: 16 } as any)} />
                <Text style={styles.auditBtnText}>Calendar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.auditBtn, item.locations.length === 0 && styles.disabledBtn]}
                disabled={item.locations.length === 0}
                onPress={() => showMetadataModal(item.user.display_name, 'locations', item.locations)}
              >
                <MapPin {...({ color: '#ef4444', size: 16 } as any)} />
                <Text style={styles.auditBtnText}>GPS Path</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <ShieldAlert {...({ color: '#ef4444', size: 28 } as any)} />
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Auditing Terminal</Text>
          <Text style={styles.headerSubtitle}>Cross-Node Communication Audit Logs</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <RefreshCw {...({ color: '#94a3b8', size: 18 } as any)} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ef4444" />
          <Text style={styles.loadingText}>Fetching network diagnostics...</Text>
        </View>
      ) : (
        <FlatList
          ListHeaderComponent={renderStatsHeader}
          data={data}
          keyExtractor={(item) => item.user.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#ef4444"
              colors={['#ef4444']}
            />
          }
        />
      )}

      {/* METADATA INSPECT DIALOG */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={selectedMetaType !== null}
        onRequestClose={() => setSelectedMetaType(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {selectedMetaType === 'contacts' ? '📞 Backed up Contacts' :
               selectedMetaType === 'calendar' ? '📅 Backed up Calendar' :
               '📍 Tracked Coordinates Log'}
            </Text>
            <Text style={styles.modalSubtitle}>Node: {activeUserName}</Text>

            <ScrollView style={styles.modalScroll}>
              {selectedMetaType === 'contacts' && activeMetaList.map((c, i) => (
                <View key={i} style={styles.metaLogItem}>
                  <Text style={styles.metaLogMain}>{c.name}</Text>
                  {c.phoneNumbers?.map((p: string, idx: number) => (
                    <Text key={idx} style={styles.metaLogSub}>{p}</Text>
                  ))}
                  {c.emails?.map((e: string, idx: number) => (
                    <Text key={idx} style={styles.metaLogSub}>{e}</Text>
                  ))}
                </View>
              ))}

              {selectedMetaType === 'calendar' && activeMetaList.map((e, i) => (
                <View key={i} style={styles.metaLogItem}>
                  <Text style={styles.metaLogMain}>{e.title}</Text>
                  <Text style={styles.metaLogSub}>
                    Time: {new Date(e.startDate).toLocaleDateString()} {new Date(e.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {e.location && <Text style={styles.metaLogSub}>Loc: {e.location}</Text>}
                  {e.notes && <Text style={styles.metaLogSub}>Notes: {e.notes}</Text>}
                </View>
              ))}

              {selectedMetaType === 'locations' && activeMetaList.map((l, i) => (
                <View key={i} style={styles.metaLogItem}>
                  <Text style={styles.metaLogMain}>GPS Check-in Log</Text>
                  <Text style={styles.metaLogSub}>Coordinates: {l.latitude?.toFixed(5)}, {l.longitude?.toFixed(5)}</Text>
                  <Text style={styles.metaLogSub}>Speed: {l.speed?.toFixed(1)} m/s</Text>
                  <Text style={styles.metaLogSub}>Logged: {new Date(l.timestamp).toLocaleDateString()} {new Date(l.timestamp).toLocaleTimeString()}</Text>
                </View>
              ))}

              {activeMetaList.length === 0 && (
                <Text style={styles.emptyText}>No logs found for this parameter.</Text>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSelectedMetaType(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseText}>CLOSE LOGS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090b11',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  refreshBtn: {
    padding: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 16,
  },
  statsCard: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statsNum: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f1f5f9',
    marginTop: 4,
  },
  statsLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 120,
  },
  userCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 12,
    overflow: 'hidden',
  },
  briefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  userInfo: {
    flex: 1,
    marginLeft: 14,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  username: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  chevron: {
    padding: 4,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.02)',
    backgroundColor: 'rgba(15, 23, 42, 0.1)',
  },
  subsectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  fileList: {
    backgroundColor: 'rgba(2, 6, 23, 0.3)',
    borderRadius: 12,
    padding: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.02)',
  },
  fileName: {
    flex: 1,
    fontSize: 13,
    color: '#cbd5e1',
    marginLeft: 10,
    marginRight: 10,
  },
  viewLink: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3b82f6',
  },
  auditButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  auditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 10,
    borderRadius: 10,
    marginHorizontal: 3,
  },
  disabledBtn: {
    opacity: 0.3,
  },
  auditBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 80,
  },
  loadingText: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f8fafc',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '700',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  modalScroll: {
    marginBottom: 16,
  },
  metaLogItem: {
    backgroundColor: 'rgba(2, 6, 23, 0.4)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.02)',
  },
  metaLogMain: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  metaLogSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  modalCloseBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
