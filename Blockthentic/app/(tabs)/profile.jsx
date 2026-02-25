import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppKit } from '@reown/appkit-react-native';
import { useAccount, useDisconnect } from 'wagmi';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabaseClient';

const MEMBER_ROLES = ['admin', 'user'];

export default function ProfilePage() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState(null);
  const [ownedRegistries, setOwnedRegistries] = useState([]);
  const [selectedRegistryId, setSelectedRegistryId] = useState(null);
  const [members, setMembers] = useState([]);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('user');

  const loadProfile = React.useCallback(async () => {
    if (!user || !supabase) return;
    try {
      const [{ data: profileData }, { data: registryData }] = await Promise.all([
        supabase.from('profiles').select('username, email, created_at').eq('id', user.id).maybeSingle(),
        supabase
          .from('registries')
          .select('id, name, created_at')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      setProfile(profileData || null);
      setOwnedRegistries(Array.isArray(registryData) ? registryData : []);
    } catch (err) {
      console.error('Profile load error:', err?.message ?? err);
    }
  }, [user]);

  const loadMembers = React.useCallback(async () => {
    if (!selectedRegistryId || !supabase) {
      setMembers([]);
      return;
    }

    const { data: memberships, error } = await supabase
      .from('registry_memberships')
      .select('id, user_id, role, status, created_at')
      .eq('registry_id', selectedRegistryId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Load members failed:', error.message);
      return;
    }

    if (!memberships || memberships.length === 0) {
      setMembers([]);
      return;
    }

    const userIds = memberships.map((m) => m.user_id);
    const { data: profiles } = await supabase.from('profiles').select('id, username, email').in('id', userIds);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    setMembers(
      memberships.map((m) => ({
        ...m,
        username: profileMap.get(m.user_id)?.username || 'unknown',
        email: profileMap.get(m.user_id)?.email || '',
      }))
    );
  }, [selectedRegistryId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!selectedRegistryId && ownedRegistries.length > 0) {
      setSelectedRegistryId(ownedRegistries[0].id);
    }
  }, [ownedRegistries, selectedRegistryId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useFocusEffect(
    React.useCallback(() => {
      loadProfile();
      loadMembers();
    }, [loadProfile, loadMembers])
  );

  const userName = profile?.username || user?.email?.split('@')[0] || 'Member';
  const userEmail = profile?.email || user?.email || 'Unknown';
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  const contractsCount = ownedRegistries.length;

  const selectedRegistry = useMemo(
    () => ownedRegistries.find((r) => r.id === selectedRegistryId) || null,
    [ownedRegistries, selectedRegistryId]
  );

  const inviteMember = async () => {
    if (!selectedRegistryId) {
      Alert.alert('Missing registry', 'Select one of your registries first.');
      return;
    }

    const normalized = inviteUsername.trim().toLowerCase();
    if (!normalized) {
      Alert.alert('Missing username', 'Enter a username to invite.');
      return;
    }

    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', normalized)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      Alert.alert('Invite failed', profileError.message);
      return;
    }
    if (!targetProfile) {
      Alert.alert('Invite failed', `Username "${normalized}" does not exist.`);
      return;
    }

    const payload = {
      registry_id: selectedRegistryId,
      user_id: targetProfile.id,
      role: inviteRole,
      status: 'active',
      invited_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('registry_memberships')
      .upsert(payload, { onConflict: 'registry_id,user_id' });

    if (error) {
      Alert.alert('Invite failed', error.message);
      return;
    }

    setInviteUsername('');
    Alert.alert('Success', `Added ${targetProfile.username} as ${inviteRole}.`);
    loadMembers();
  };

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

          <View style={styles.membershipCard}>
            <Text style={styles.sectionTitle}>Registry Members</Text>
            <Text style={styles.sectionSub}>Invite by username and assign role.</Text>

            <Text style={styles.inputLabel}>Your Registries</Text>
            {ownedRegistries.length === 0 ? (
              <Text style={styles.hint}>Create a registry first to manage members.</Text>
            ) : (
              <View style={styles.chipWrap}>
                {ownedRegistries.map((registry) => {
                  const selected = registry.id === selectedRegistryId;
                  return (
                    <TouchableOpacity
                      key={registry.id}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={() => setSelectedRegistryId(registry.id)}
                    >
                      <Text style={styles.chipText}>{registry.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {selectedRegistry ? (
              <>
                <Text style={styles.inputLabel}>Invite Username</Text>
                <TextInput
                  style={styles.input}
                  value={inviteUsername}
                  onChangeText={setInviteUsername}
                  autoCapitalize="none"
                  placeholder="username"
                  placeholderTextColor="#666"
                />

                <Text style={styles.inputLabel}>Role</Text>
                <View style={styles.chipWrap}>
                  {MEMBER_ROLES.map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={[styles.chip, inviteRole === role && styles.chipActive]}
                      onPress={() => setInviteRole(role)}
                    >
                      <Text style={styles.chipText}>{role}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.inviteBtn} onPress={inviteMember}>
                  <Text style={styles.inviteBtnText}>Add / Update Member</Text>
                </TouchableOpacity>

                <Text style={[styles.inputLabel, { marginTop: 14 }]}>Current Members</Text>
                {members.length === 0 ? (
                  <Text style={styles.hint}>No members added yet.</Text>
                ) : (
                  members.map((member) => (
                    <View key={member.id} style={styles.memberRow}>
                      <Text style={styles.memberName}>{member.username}</Text>
                      <Text style={styles.memberRole}>{member.role}</Text>
                    </View>
                  ))
                )}
              </>
            ) : null}
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
  contentContainer: { paddingHorizontal: 25, paddingTop: 20, alignItems: 'center', paddingBottom: 120 },
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
    marginBottom: 20,
  },
  walletTitle: { fontSize: 16, fontWeight: '600', color: 'rgba(0, 50, 98, 0.8)', marginBottom: 5 },
  walletAddress: { fontSize: 12, color: 'rgba(0, 50, 98, 0.6)', fontFamily: 'Courier' },
  walletActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  walletActionText: { fontSize: 14, color: '#003262', fontWeight: '600', textDecorationLine: 'underline' },
  membershipCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#003262',
    backgroundColor: 'rgba(255,255,255,0.35)',
    padding: 14,
    marginBottom: 18,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#003262' },
  sectionSub: { fontSize: 12, color: '#003262', opacity: 0.85, marginTop: 2, marginBottom: 10 },
  inputLabel: { color: '#003262', fontWeight: '700', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#003262',
    borderRadius: 10,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.65)',
    color: '#003262',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#003262',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(125,142,196,0.25)',
  },
  chipActive: { backgroundColor: '#7d8ec4' },
  chipText: { color: '#003262', fontWeight: '600' },
  inviteBtn: {
    marginTop: 12,
    backgroundColor: '#003262',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  inviteBtnText: { color: '#fff', fontWeight: '700' },
  hint: { color: '#003262', opacity: 0.8 },
  memberRow: {
    borderWidth: 1,
    borderColor: '#003262',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(125,142,196,0.2)',
  },
  memberName: { color: '#003262', fontWeight: '600' },
  memberRole: { color: '#003262', fontWeight: '700' },
  signOutButton: { alignSelf: 'flex-end', marginBottom: 30 },
  signOutText: { color: '#003262', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  statsContainer: { width: '100%' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  statLabel: { fontSize: 16, color: '#333', fontWeight: '400' },
  statValue: { fontSize: 16, color: '#003262', fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#003262', opacity: 0.3, width: '100%' },
});

