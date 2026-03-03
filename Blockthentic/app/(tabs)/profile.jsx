import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppKit } from '../../config/AppKitConfig';
import { useAccount, useDisconnect } from 'wagmi';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabaseClient';

export default function ProfilePage() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState(null);
  const [contractsCount, setContractsCount] = useState(0);

  const loadProfile = React.useCallback(async () => {
    if (!user || !supabase) return;
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('username, email, created_at')
        .eq('id', user.id)
        .maybeSingle();

      const { count } = await supabase
        .from('registries')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', user.id);

      setProfile(profileData || null);
      setContractsCount(count || 0);
    } catch (err) {
      console.error('Profile load error:', err?.message ?? err);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    React.useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const userName = profile?.username || user?.email?.split('@')[0] || 'Member';
  const userEmail = profile?.email || user?.email || 'Unknown';
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '…';

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#bdc8feff', '#fef4d3ff']} style={styles.background} />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <Text style={styles.headerTitle}>Profile</Text>

          <View style={styles.userInfoSection}>
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.userEmail}>{userEmail}</Text>
          </View>

          <View style={styles.walletCard}>
            <View>
              <Text style={styles.walletTitle}>
                {isConnected ? 'Wallet Connected' : 'Wallet Not Connected'}
              </Text>
              <Text style={styles.walletAddress}>
                {isConnected ? address : 'Connect your wallet to manage contracts'}
              </Text>
            </View>

            <View style={styles.walletActionsRow}>
              <TouchableOpacity onPress={() => (isConnected ? disconnect() : open())}>
                <Text style={styles.walletActionText}>{isConnected ? 'Disconnect' : 'Connect'}</Text>
              </TouchableOpacity>

              {isConnected && (
                <>
                  <TouchableOpacity onPress={() => open({ view: 'Account' })}>
                    <Text style={styles.walletActionText}>Wallet Settings</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => open({ view: 'Networks' })}>
                    <Text style={styles.walletActionText}>Switch Network</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          <View style={styles.statsContainer}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Member Since</Text>
              <Text style={styles.statValue}>{memberSince}</Text>
            </View>
            <View style={styles.divider} />

            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Plan</Text>
              <Text style={styles.statValue}>Free</Text>
            </View>
            <View style={styles.divider} />

            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Contracts Created</Text>
              <Text style={styles.statValue}>{contractsCount}</Text>
            </View>
            <View style={styles.divider} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
  safeArea: { flex: 1 },
  contentContainer: { paddingHorizontal: 25, paddingTop: 20, alignItems: 'center', paddingBottom: 120, maxWidth: 800, width: '100%', alignSelf: 'center' },
  headerTitle: { fontSize: 36, color: '#003262', fontWeight: '400', paddingBottom: 30 },
  userInfoSection: { width: '100%', alignItems: 'flex-start', marginBottom: 20 },
  userName: { fontSize: 28, fontWeight: '800', color: '#003262', marginBottom: 4 },
  userEmail: { fontSize: 16, color: '#555', marginBottom: 20 },
  walletCard: {
    width: '100%',
    backgroundColor: '#6b7db3',
    borderRadius: 20,
    padding: 20,
    minHeight: 140,
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  walletTitle: { fontSize: 16, fontWeight: '600', color: 'rgba(0, 50, 98, 0.8)', marginBottom: 5 },
  walletAddress: { fontSize: 12, color: 'rgba(0, 50, 98, 0.6)', fontFamily: 'Courier' },
  walletActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  walletActionText: { fontSize: 14, color: '#003262', fontWeight: '600', textDecorationLine: 'underline' },
  signOutButton: { alignSelf: 'flex-end', marginBottom: 30 },
  signOutText: { color: '#003262', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  statsContainer: { width: '100%' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  statLabel: { fontSize: 16, color: '#333', fontWeight: '400' },
  statValue: { fontSize: 16, color: '#003262', fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#003262', opacity: 0.3, width: '100%' },
});