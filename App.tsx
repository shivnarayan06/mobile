import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, Image, Alert, 
  ActivityIndicator, ScrollView, TextInput, KeyboardAvoidingView, 
  Platform, RefreshControl 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import axios from 'axios';
import { StatusBar } from 'expo-status-bar';

// For web, use localhost. For native mobile, use the tunnel or host IP.
const defaultServerUrl = Platform.OS === 'web' 
  ? 'http://localhost:5001' 
  : 'http://localhost:5001';

const CITIZEN_ID = 'citizen_bhopal';

const ISSUE_TYPES = [
  { id: 'Pothole', icon: '🕳️' },
  { id: 'Water Leak', icon: '💧' },
  { id: 'Streetlight', icon: '💡' },
  { id: 'Garbage', icon: '🗑️' },
  { id: 'Fallen Tree', icon: '🌳' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'REPORT' | 'MY_REPORTS'>('REPORT');
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [issueType, setIssueType] = useState<string>('Pothole');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);

  // My Reports state
  const [myReports, setMyReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      await Location.requestForegroundPermissionsAsync();
      await ImagePicker.requestCameraPermissionsAsync();
    })();
    fetchMyReports();
  }, []);

  const fetchMyReports = async () => {
    setLoadingReports(true);
    try {
      const endpoint = `${serverUrl}/api/tickets?reporter_id=${CITIZEN_ID}`;
      const res = await axios.get(endpoint, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (res.data && res.data.tickets) {
        setMyReports(res.data.tickets);
      }
    } catch (e) {
      console.log('Error fetching my reports:', e);
    } finally {
      setLoadingReports(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMyReports();
  }, [serverUrl]);

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permissions are required to report issues.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImage(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || null);
      fetchLocation();
    }
  };

  const fetchLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access was denied.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(loc);
    } catch (error) {
      console.log('Location error:', error);
    }
  };

  const getBase64FromUri = async (uri: string) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  const submitIssue = async () => {
    if (!image) {
      Alert.alert('Missing Photo', 'Please take a photo of the issue first.');
      return;
    }
    if (!location) {
      Alert.alert('Missing Location', 'Please wait for GPS location to be acquired.');
      return;
    }

    setIsSubmitting(true);

    try {
      let finalBase64 = imageBase64;
      if (!finalBase64) {
        finalBase64 = await getBase64FromUri(image);
      }

      const endpoint = `${serverUrl}/api/tickets`;
      
      const response = await axios.post(endpoint, {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        reporter_id: CITIZEN_ID,
        base64_image: finalBase64
      }, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });

      if (response.status === 201) {
        const assignedWard = response.data.ticket?.ward_name || 'Central Command';
        const assignedOfficer = response.data.ticket?.officer_name || 'Duty Officer';
        const msg = `✅ Issue Reported!\n\nAI Analysis: ${response.data.aiAnalysis?.category} (Severity ${response.data.aiAnalysis?.severity}/100)\n\n🏛️ Assigned to: ${assignedWard}\n👮 Officer: ${assignedOfficer}`;

        if (Platform.OS === 'web') {
          window.alert(msg);
          resetForm();
          setActiveTab('MY_REPORTS');
          fetchMyReports();
        } else {
          Alert.alert('Report Submitted!', msg, [
            { 
              text: 'Track in My Reports', 
              onPress: () => {
                resetForm();
                setActiveTab('MY_REPORTS');
                fetchMyReports();
              }
            }
          ]);
        }
      }
    } catch (error) {
      console.error(error);
      const msg = '❌ Failed to submit issue. Ensure Backend is running on port 5001!';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setImage(null);
    setImageBase64(null);
    setLocation(null);
    setIssueType('Pothole');
  };

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return 'Recently';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'Pothole': return '🕳️';
      case 'Water Leak': return '💧';
      case 'Streetlight': return '💡';
      case 'Garbage': return '🗑️';
      case 'Fallen Tree': return '🌳';
      default: return '📍';
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
      <StatusBar style="light" />
      
      {/* Top App Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>NIRVAH Citizen</Text>
            <Text style={styles.headerSubtitle}>Public Civic Infrastructure Portal</Text>
          </View>
          <View style={styles.citizenBadge}>
            <Text style={styles.citizenBadgeText}>👤 Bhopal Citizen</Text>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'REPORT' && styles.tabButtonActive]}
            onPress={() => setActiveTab('REPORT')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'REPORT' && styles.tabButtonTextActive]}>
              📷 Report Issue
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'MY_REPORTS' && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab('MY_REPORTS');
              fetchMyReports();
            }}
          >
            <Text style={[styles.tabButtonText, activeTab === 'MY_REPORTS' && styles.tabButtonTextActive]}>
              📋 My Reports {myReports.length > 0 ? `(${myReports.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Body */}
      {activeTab === 'REPORT' ? (
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.card}>
            <Text style={styles.label}>1. Capture Issue Photo</Text>
            {image ? (
              <TouchableOpacity onPress={takePhoto} style={styles.imagePreviewContainer}>
                <Image source={{ uri: image }} style={styles.imagePreview} />
                <View style={styles.retakeOverlay}>
                  <Text style={styles.retakeText}>Tap to Retake Photo</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.cameraButton} onPress={takePhoto}>
                <Text style={styles.cameraButtonIcon}>📷</Text>
                <Text style={styles.cameraButtonText}>Take Live Photo</Text>
                <Text style={{ fontSize: 12, color: '#93c5fd', marginTop: 4 }}>
                  Camera will auto-acquire GPS coordinates
                </Text>
              </TouchableOpacity>
            )}

            {location && (
              <Text style={styles.locationText}>
                📍 GPS Coordinates: {location.coords.latitude.toFixed(4)}, {location.coords.longitude.toFixed(4)}
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>2. Select Category (AI will verify)</Text>
            <View style={styles.typeGrid}>
              {ISSUE_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeButton,
                    issueType === type.id && styles.typeButtonActive
                  ]}
                  onPress={() => setIssueType(type.id)}
                >
                  <Text style={styles.typeIcon}>{type.icon}</Text>
                  <Text style={[
                    styles.typeText,
                    issueType === type.id && styles.typeTextActive
                  ]}>{type.id}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Settings & Connection</Text>
            <Text style={{fontSize: 12, color: '#666', marginBottom: 4}}>NIRVAH Backend URL</Text>
            <TextInput 
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity 
            style={[styles.submitButton, (!image || isSubmitting) && styles.submitButtonDisabled]} 
            onPress={submitIssue}
            disabled={!image || isSubmitting}
          >
            {isSubmitting ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.submitButtonText}>Analyzing with Gemini AI...</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>🚀 Submit Civic Report</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        /* My Reports Screen */
        <ScrollView 
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.myReportsHeader}>
            <Text style={styles.myReportsTitle}>My Submitted Reports</Text>
            <TouchableOpacity onPress={fetchMyReports} style={styles.refreshBadge}>
              <Text style={styles.refreshBadgeText}>🔄 Refresh Status</Text>
            </TouchableOpacity>
          </View>

          {loadingReports && !refreshing ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#1e3a8a" />
              <Text style={{ marginTop: 12, color: '#64748b' }}>Fetching your reports...</Text>
            </View>
          ) : myReports.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 44, marginBottom: 12 }}>📋</Text>
              <Text style={styles.emptyTitle}>No Reports Filed Yet</Text>
              <Text style={styles.emptySubtitle}>
                Whenever you report civic hazards like potholes or water leaks, you can track crew dispatch and resolution right here.
              </Text>
              <TouchableOpacity 
                style={styles.fileReportButton}
                onPress={() => setActiveTab('REPORT')}
              >
                <Text style={styles.fileReportButtonText}>📸 File Your First Report</Text>
              </TouchableOpacity>
            </View>
          ) : (
            myReports.map((report) => {
              const isDispatched = report.status === 'IN_PROGRESS' || report.status === 'RESOLVED';
              const isResolved = report.status === 'RESOLVED';
              const imageUrl = report.image_url?.startsWith('http') 
                ? report.image_url 
                : `${serverUrl}${report.image_url}`;

              return (
                <View key={report.id} style={styles.reportCard}>
                  {/* Top metadata */}
                  <View style={styles.reportCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.reportId}>{report.id}</Text>
                      <View style={[
                        styles.statusPill,
                        isResolved ? styles.statusPillResolved : isDispatched ? styles.statusPillDispatched : styles.statusPillSubmitted
                      ]}>
                        <Text style={[
                          styles.statusPillText,
                          isResolved ? styles.textResolved : isDispatched ? styles.textDispatched : styles.textSubmitted
                        ]}>
                          {isResolved ? '✅ Resolved' : isDispatched ? '⚡ In Progress' : '⏳ Submitted'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.reportTime}>{formatTimeAgo(report.reported_at)}</Text>
                  </View>

                  {/* Main issue row */}
                  <View style={styles.reportCardBody}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportType}>
                        {getCategoryIcon(report.type)} {report.type}
                      </Text>
                      <Text style={styles.reportWard}>
                        🏛️ {report.ward_name || 'Central Command Zone'}
                      </Text>
                      <Text style={styles.reportOfficer}>
                        👮 Officer: {report.officer_name || 'General Duty Officer'}
                      </Text>
                      {report.description && (
                        <Text style={styles.reportDescSnippet} numberOfLines={2}>
                          "{report.description}"
                        </Text>
                      )}
                    </View>

                    {report.image_url && (
                      <Image 
                        source={{ uri: imageUrl }} 
                        style={styles.reportThumb} 
                        resizeMode="cover"
                      />
                    )}
                  </View>

                  {/* 3-Step Live Timeline */}
                  <View style={styles.timelineContainer}>
                    {/* Step 1: Submitted */}
                    <View style={styles.timelineStep}>
                      <View style={[styles.timelineNode, styles.nodeActive]}>
                        <Text style={styles.nodeText}>✓</Text>
                      </View>
                      <Text style={[styles.timelineLabel, styles.labelActive]}>Reported</Text>
                    </View>

                    {/* Line 1 */}
                    <View style={[styles.timelineLine, isDispatched && styles.lineActive]} />

                    {/* Step 2: Dispatched */}
                    <View style={styles.timelineStep}>
                      <View style={[styles.timelineNode, isDispatched ? styles.nodeActive : styles.nodePending]}>
                        <Text style={[styles.nodeText, !isDispatched && styles.nodeTextPending]}>
                          {isDispatched ? '✓' : '2'}
                        </Text>
                      </View>
                      <Text style={[styles.timelineLabel, isDispatched && styles.labelActive]}>
                        {isDispatched ? 'Dispatched' : 'Reviewing'}
                      </Text>
                    </View>

                    {/* Line 2 */}
                    <View style={[styles.timelineLine, isResolved && styles.lineActive]} />

                    {/* Step 3: Resolved */}
                    <View style={styles.timelineStep}>
                      <View style={[styles.timelineNode, isResolved ? styles.nodeResolved : styles.nodePending]}>
                        <Text style={[styles.nodeText, !isResolved && styles.nodeTextPending]}>
                          {isResolved ? '✓' : '3'}
                        </Text>
                      </View>
                      <Text style={[styles.timelineLabel, isResolved && styles.labelResolved]}>
                        Fixed
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f1f5f9',
    paddingBottom: 40,
  },
  header: {
    backgroundColor: '#0f172a',
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
  },
  citizenBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  citizenBadgeText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  tabButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: 'white',
    fontWeight: '700',
  },
  card: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 18,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  cameraButton: {
    backgroundColor: '#eff6ff',
    height: 180,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#93c5fd',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  cameraButtonIcon: {
    fontSize: 44,
    marginBottom: 8,
  },
  cameraButtonText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 16,
  },
  imagePreviewContainer: {
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  retakeOverlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    padding: 10,
    alignItems: 'center',
  },
  retakeText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
  },
  locationText: {
    marginTop: 12,
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeButtonActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  typeIcon: {
    fontSize: 16,
  },
  typeText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
  typeTextActive: {
    color: '#2563eb',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: '#10b981',
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 18,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },

  /* My Reports Styles */
  myReportsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 18,
    marginTop: 18,
    marginBottom: 8,
  },
  myReportsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
  },
  refreshBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
  },
  refreshBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  emptyContainer: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 20,
    padding: 32,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  fileReportButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  fileReportButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  reportCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reportCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportId: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reportTime: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  statusPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusPillSubmitted: {
    backgroundColor: '#fef3c7',
  },
  statusPillDispatched: {
    backgroundColor: '#dbeafe',
  },
  statusPillResolved: {
    backgroundColor: '#d1fae5',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textSubmitted: { color: '#b45309' },
  textDispatched: { color: '#1d4ed8' },
  textResolved: { color: '#047857' },

  reportCardBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  reportType: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  reportWard: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
    marginBottom: 2,
  },
  reportOfficer: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
    marginBottom: 6,
  },
  reportDescSnippet: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    fontStyle: 'italic',
  },
  reportThumb: {
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },

  /* 3-Step Timeline */
  timelineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  timelineStep: {
    alignItems: 'center',
    width: 72,
  },
  timelineNode: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  nodeActive: {
    backgroundColor: '#2563eb',
  },
  nodeResolved: {
    backgroundColor: '#10b981',
  },
  nodePending: {
    backgroundColor: '#e2e8f0',
  },
  nodeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '800',
  },
  nodeTextPending: {
    color: '#94a3b8',
  },
  timelineLine: {
    flex: 1,
    height: 3,
    backgroundColor: '#e2e8f0',
    marginTop: -16,
  },
  lineActive: {
    backgroundColor: '#2563eb',
  },
  timelineLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
    textAlign: 'center',
  },
  labelActive: {
    color: '#1e3a8a',
    fontWeight: '700',
  },
  labelResolved: {
    color: '#047857',
    fontWeight: '700',
  },
});