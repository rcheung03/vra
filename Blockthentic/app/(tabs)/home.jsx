import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabaseClient';

const short = (value) => (value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'Pending');

function getExplorerAddressUrl(chain, contractAddress) {
  if (!contractAddress) return null;
  if (chain === 'ethereum') return `https://sepolia.etherscan.io/address/${contractAddress}`;
  if (chain === 'polygon') return `https://amoy.polygonscan.com/address/${contractAddress}`;
  if (chain === 'arbitrum') return `https://sepolia.arbiscan.io/address/${contractAddress}`;
  return null;
}

const ContractCard = ({ item }) => {
  const explorerUrl = getExplorerAddressUrl(item.chain, item.contractAddress);

  const openExplorer = async () => {
    if (!explorerUrl) return;
    try {
      await Linking.openURL(explorerUrl);
    } catch {
      Alert.alert('Open failed', 'Could not open explorer link.');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardMeta}>Role: {item.roleLabel}</Text>
        <Text style={styles.cardMeta}>Access: {item.accessMode || 'owner_only'}</Text>
        <Text style={styles.cardMeta}>Created: {item.date}</Text>
        <Text style={styles.cardMeta}>Type: {item.type}</Text>
        <Text style={styles.cardMeta}>Chain: {item.chain || 'n/a'}</Text>
        <Text style={styles.cardMeta}>Status: {item.status || 'unknown'}</Text>
        <Text style={styles.cardAddress}>Contract: {short(item.contractAddress)}</Text>
        <Text style={styles.cardAddress}>Config: {short(item.configHash)}</Text>

        {explorerUrl && (
          <TouchableOpacity onPress={openExplorer} style={styles.explorerButton}>
            <Text style={styles.explorerButtonText}>Open in Explorer</Text>
          </TouchableOpacity>
        )}
      </View>

      <Ionicons name="cube-outline" size={28} color="#003262" />
    </View>
  );
};

function groupAssetsByRegistry(assets, registryMap) {
  const grouped = new Map();
  for (const asset of assets) {
    const key = asset.registry_id || 'unknown';
    const registry = registryMap.get(key);
    if (!grouped.has(key)) {
      grouped.set(key, {
        registryId: key,
        registryName: registry?.name || 'Unknown Registry',
        chain: registry?.chain || 'n/a',
        contractAddress: registry?.contract_address || null,
        items: [],
      });
    }
    grouped.get(key).items.push(asset);
  }
  return Array.from(grouped.values());
}

// Helper to filter Grouped Assets by Registry Name OR Document Name
function filterGroups(groups, search) {
  if (!search) return groups;
  const lowerSearch = search.toLowerCase();
  return groups.map(group => {
    const registryMatch = group.registryName?.toLowerCase().includes(lowerSearch);
    const filteredItems = group.items.filter(item =>
      (item.file_name || '').toLowerCase().includes(lowerSearch)
    );
    if (registryMatch) return group; // If registry matches, show all its items
    if (filteredItems.length > 0) return { ...group, items: filteredItems }; // If items match, show only those items
    return null;
  }).filter(Boolean);
}

// Reusable Search Component
  const SearchBox = ({ value, onChange }) => (
    <View style={styles.searchContainer}>
      <Ionicons name="search-outline" size={18} color="rgba(0, 50, 98, 0.6)" />
      <TextInput
        style={styles.searchInput}
        placeholder="Filter results"
        placeholderTextColor="rgba(0, 50, 98, 0.4)"
        value={value}
        onChangeText={onChange}
      />
    </View>
  );

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [assignedToMe, setAssignedToMe] = useState([]);
  const [registeredByMe, setRegisteredByMe] = useState([]);
  const [loading, setLoading] = useState(false);

  // Search & Expansion States
  const [searchRegistries, setSearchRegistries] = useState('');
  const [searchAssigned, setSearchAssigned] = useState('');
  const [searchRegistered, setSearchRegistered] = useState('');
  const [expandedRegistries, setExpandedRegistries] = useState(false);
  const [expandedAssigned, setExpandedAssigned] = useState(false);
  const [expandedRegistered, setExpandedRegistered] = useState(false);

  const loadData = React.useCallback(async () => {
    if (!user || !supabase) return;
    setLoading(true);
    try {
      const [
        { data: profileData },
        { data: registryData },
        { data: memberships },
        { data: assignedData },
        { data: registeredData },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, email, created_at')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('registries')
          .select('id, owner_id, name, template_type, chain, contract_address, config_hash, deployment_status, created_at, access_mode')
          .not('contract_address', 'is', null)
          .eq('deployment_status', 'deployed')
          .order('created_at', { ascending: false }),
        supabase
          .from('registry_memberships')
          .select('registry_id, role, status')
          .eq('user_id', user.id)
          .eq('status', 'active'),
        supabase
          .from('registry_records')
          .select('id, file_name, resource_uri, tx_hash, created_at, registry_id, owner_id, assigned_user_id, assigned_username, registered_by_user_id, registered_by_username')
          .eq('assigned_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('registry_records')
          .select('id, file_name, resource_uri, tx_hash, created_at, registry_id, assigned_user_id, assigned_username, registered_by_user_id, registered_by_username, owner_id')
          .or(`registered_by_user_id.eq.${user.id},owner_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      const membershipMap = new Map((memberships || []).map((m) => [m.registry_id, m.role]));
      const visibleRegistries = (registryData || []).reduce((acc, registry) => {
        const role = membershipMap.get(registry.id) || null;
        const allowed = registry.owner_id === user.id || Boolean(role) || registry.access_mode === 'public_read';
        if (allowed) acc.push({ ...registry, role });
        return acc;
      }, []);

      setProfile(profileData || null);
      setContracts(visibleRegistries);
      setAssignedToMe(Array.isArray(assignedData) ? assignedData : []);
      setRegisteredByMe(Array.isArray(registeredData) ? registeredData : []);
    } catch (err) {
      console.error('Home data load error:', err?.message ?? err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [loadData])
  );

  const userName = profile?.username || user?.email?.split('@')[0] || 'Member';

  const openAsset = async (asset) => {
    try {
      const uri = asset?.resource_uri || '';
      if (!uri) {
        Alert.alert('No asset URI', 'This record does not have a stored asset URL.');
        return;
      }

      let finalUrl = uri;
      const isHttp = /^https?:\/\//i.test(uri);
      const isSupabase = uri.startsWith('supabase://');
      const isIpfs = uri.startsWith('ipfs://');

      if (!isHttp && !isSupabase && !isIpfs) {
        const filename = uri;
        const registryId = asset?.registry_id;
        if (!filename || !registryId) {
          Alert.alert('Legacy record', 'This asset has no usable URI or registry metadata.');
          return;
        }

        const candidatePrefixes = [
          `${user?.id || ''}/${registryId}`,
          `${asset?.owner_id || ''}/${registryId}`,
        ].filter(Boolean);

        let matchedPath = null;
        for (const prefix of candidatePrefixes) {
          const { data: objects, error: listErr } = await supabase.storage.from('registry-assets').list(prefix, { limit: 100 });
          if (listErr) continue;

          const exact = (objects || []).find((f) => f?.name === filename);
          if (exact) {
            matchedPath = `${prefix}/${exact.name}`;
            break;
          }

          const suffixed = (objects || []).find((f) => f?.name?.endsWith(`-${filename}`));
          if (suffixed) {
            matchedPath = `${prefix}/${suffixed.name}`;
            break;
          }
        }

        if (!matchedPath) {
          Alert.alert('Legacy record', 'Could not find this file in storage. Re-upload this asset once to bind it to a stable URL.');
          return;
        }

        const { data: signed, error: signedErr } = await supabase.storage
          .from('registry-assets')
          .createSignedUrl(matchedPath, 60 * 30);
        if (signedErr) throw signedErr;

        finalUrl = signed?.signedUrl;
      }

      if (isSupabase) {
        const raw = uri.replace('supabase://', '');
        const slash = raw.indexOf('/');
        if (slash <= 0) {
          Alert.alert('Invalid URI', 'Stored asset URI format is invalid.');
          return;
        }
        const bucket = raw.slice(0, slash);
        const path = raw.slice(slash + 1);
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 30);
        if (error) throw error;
        finalUrl = data?.signedUrl;
      }

      if (!finalUrl) {
        Alert.alert('Open failed', 'Could not create a valid asset URL.');
        return;
      }

      await Linking.openURL(finalUrl);
    } catch (err) {
      Alert.alert('Open asset failed', err?.message || 'Unknown error while opening asset.');
      console.error('Open asset failed:', err?.message || err);
    }
  };

  // 1. Process Raw Data
  const contractCards = useMemo(() => (
    contracts.map((contract) => {
      const isOwner = contract.owner_id === user?.id;
      return {
        id: contract.id,
        title: contract.name,
        date: contract.created_at ? new Date(contract.created_at).toLocaleDateString() : 'Unknown',
        type: contract.template_type,
        chain: contract.chain,
        status: contract.deployment_status,
        accessMode: contract.access_mode,
        roleLabel: isOwner ? 'owner' : (contract.role || 'user'),
        contractAddress: contract.contract_address,
        configHash: contract.config_hash,
      };
    })
  ), [contracts, user?.id]);

  const registryMap = useMemo(() => {
    const m = new Map();
    contracts.forEach((c) => m.set(c.id, c));
    return m;
  }, [contracts]);

  const assignedGroupedRaw = useMemo(() => groupAssetsByRegistry(assignedToMe, registryMap), [assignedToMe, registryMap]);
  const registeredGroupedRaw = useMemo(() => groupAssetsByRegistry(registeredByMe, registryMap), [registeredByMe, registryMap]);

  // 2. Filter Logic
  const filteredRegistries = useMemo(() => {
    if (!searchRegistries) return contractCards;
    return contractCards.filter(c => c.title?.toLowerCase().includes(searchRegistries.toLowerCase()));
  }, [contractCards, searchRegistries]);

  const filteredAssigned = useMemo(() => filterGroups(assignedGroupedRaw, searchAssigned), [assignedGroupedRaw, searchAssigned]);
  const filteredRegistered = useMemo(() => filterGroups(registeredGroupedRaw, searchRegistered), [registeredGroupedRaw, searchRegistered]);

  // 3. Slicing Logic (Max 3 unless expanded)
  const displayedRegistries = expandedRegistries ? filteredRegistries : filteredRegistries.slice(0, 3);
  const displayedAssigned = expandedAssigned ? filteredAssigned : filteredAssigned.slice(0, 3);
  const displayedRegistered = expandedRegistered ? filteredRegistered : filteredRegistered.slice(0, 3);


  const renderGroupedAssets = (groups, emptyMessage) => {
    if (groups.length === 0) {
      return <Text style={styles.emptyText}>{searchAssigned || searchRegistered ? "No matching assets found." : emptyMessage}</Text>;
    }

    return groups.map((group) => (
      <View key={group.registryId} style={styles.groupCard}>
        <Text style={styles.groupTitle}>{group.registryName}</Text>
        <Text style={styles.cardMeta}>Chain: {group.chain}</Text>
        <Text style={styles.cardMeta}>Contract: {short(group.contractAddress)}</Text>

        {group.items.map((asset) => (
          <View key={asset.id} style={styles.assetCard}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.cardTitle}>{asset.file_name || 'Unnamed file'}</Text>
              <Text style={styles.cardMeta}>Assigned To: {asset.assigned_username || 'n/a'}</Text>
              <Text style={styles.cardMeta}>Registered By: {asset.registered_by_username || 'n/a'}</Text>
              <Text style={styles.cardMeta}>Uploaded: {asset.created_at ? new Date(asset.created_at).toLocaleString() : 'Unknown'}</Text>
              <Text style={styles.cardMeta}>Tx: {short(asset.tx_hash)}</Text>
            </View>
            {asset.resource_uri ? (
              <TouchableOpacity onPress={() => openAsset(asset)} style={styles.explorerButton}>
                <Text style={styles.explorerButtonText}>Open Asset</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
    ));
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#bdc8feff', '#fef4d3ff']} style={styles.background} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.contentWrapper}>
          <View style={styles.header}>
            <Text style={styles.greetingText}>Hi, {userName}</Text>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            
            {/* --- SECTION: Accessible Registries --- */}
            <View style={styles.sectionHeaderContainer}>
              <Text style={styles.sectionTitle}>Accessible Registries</Text>
              <SearchBox value={searchRegistries} onChange={setSearchRegistries} />
            </View>

            {displayedRegistries.length > 0 ? (
              displayedRegistries.map((contract) => (
                <ContractCard key={contract.id} item={contract} />
              ))
            ) : (
              <Text style={styles.emptyText}>
                {loading ? 'Loading registries...' : (searchRegistries ? 'No matching registries found.' : 'No registries available yet.')}
              </Text>
            )}

            {filteredRegistries.length > 3 && (
              <TouchableOpacity style={styles.showAllButton} onPress={() => setExpandedRegistries(!expandedRegistries)}>
                <Text style={styles.showAllText}>{expandedRegistries ? 'Show less' : `Show all (${filteredRegistries.length})`}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.addContractRow} onPress={() => router.push('/create')}>
              <Text style={styles.addContractText}>+ Create Registry</Text>
            </TouchableOpacity>


            {/* --- SECTION: Assets Assigned To Me --- */}
            <View style={styles.sectionHeaderContainer}>
              <Text style={styles.sectionTitle}>Assets Assigned To Me</Text>
              <SearchBox value={searchAssigned} onChange={setSearchAssigned} />
            </View>
            
            {renderGroupedAssets(displayedAssigned, 'No assets assigned to you yet.')}
            
            {filteredAssigned.length > 3 && (
              <TouchableOpacity style={styles.showAllButton} onPress={() => setExpandedAssigned(!expandedAssigned)}>
                <Text style={styles.showAllText}>{expandedAssigned ? 'Show less groups' : `Show all groups (${filteredAssigned.length})`}</Text>
              </TouchableOpacity>
            )}


            {/* --- SECTION: Assets Registered By Me --- */}
            <View style={styles.sectionHeaderContainer}>
              <Text style={styles.sectionTitle}>Assets Registered By Me</Text>
              <SearchBox value={searchRegistered} onChange={setSearchRegistered} />
            </View>

            {renderGroupedAssets(displayedRegistered, 'You have not registered any assets yet.')}

            {filteredRegistered.length > 3 && (
              <TouchableOpacity style={styles.showAllButton} onPress={() => setExpandedRegistered(!expandedRegistered)}>
                <Text style={styles.showAllText}>{expandedRegistered ? 'Show less groups' : `Show all groups (${filteredRegistered.length})`}</Text>
              </TouchableOpacity>
            )}

          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
  safeArea: { flex: 1, paddingTop: 60 },
  contentWrapper: { flex: 1, paddingHorizontal: 25, paddingTop: 20 },
  header: { alignItems: 'center', marginBottom: 30 },
  greetingText: { fontSize: 36, color: '#003262', fontWeight: '400' },
  
  // Section Headers & Search
  sectionHeaderContainer: {
    marginBottom: 15,
    marginTop: 15,
    gap: 12, // Space between title and search box
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#003262' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // Slightly white to pop against background
    borderWidth: 1,
    borderColor: 'rgba(0, 50, 98, 0.4)',
    borderRadius: 25, // Oval shaped
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: '#003262',
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }), // Prevents weird browser border on click
  },
  
  // Expansion Buttons
  showAllButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    marginBottom: 10,
  },
  showAllText: {
    color: '#003262',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  scrollContent: { paddingBottom: 120, maxWidth: 800, width: '100%', alignSelf: 'center' },
  emptyText: { color: '#003262', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  card: {
    backgroundColor: '#7d8ec4',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#003262',
  },
  cardContent: { flex: 1, paddingRight: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#003262', marginBottom: 4 },
  cardMeta: { fontSize: 12, color: '#1f2a44', marginBottom: 2 },
  cardAddress: { fontSize: 12, color: '#003262', marginTop: 2, fontWeight: '600' },
  explorerButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#003262',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.25)'
  },
  explorerButtonText: { color: '#003262', fontSize: 12, fontWeight: '700' },
  addContractRow: { alignItems: 'flex-end', marginTop: 6, marginBottom: 10 },
  addContractText: { color: '#003262', fontSize: 16, fontWeight: '500' },
  groupCard: {
    borderWidth: 1,
    borderColor: '#003262',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(125, 142, 196, 0.2)',
  },
  groupTitle: { fontSize: 15, fontWeight: '800', color: '#003262', marginBottom: 4 },
  assetCard: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#003262',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});