import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import { useRouter } from 'expo-router';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabaseClient';
import { CHAIN_CONFIG } from '../../config/factoryConfig';
import { wagmiAdapter } from '../../config/AppKitConfig';

const MODE = {
  REGISTER: 'register',
  VERIFY: 'verify',
};

const ASSET_BUCKET = 'registry-assets';

const VERIFY_ABI = {
  document: [
    {
      inputs: [
        { internalType: 'bytes32', name: 'docId', type: 'bytes32' },
        { internalType: 'bytes32', name: 'docHash', type: 'bytes32' },
      ],
      name: 'verifyDocument',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
  dataset: [
    {
      inputs: [
        { internalType: 'bytes32', name: 'datasetId', type: 'bytes32' },
        { internalType: 'bytes32', name: 'dataHash', type: 'bytes32' },
      ],
      name: 'verifyDataset',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
  media: [
    {
      inputs: [
        { internalType: 'bytes32', name: 'mediaId', type: 'bytes32' },
        { internalType: 'bytes32', name: 'mediaHash', type: 'bytes32' },
      ],
      name: 'verifyImage',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],
};

const REGISTER_ABI = {
  document: [
    {
      inputs: [
        { internalType: 'bytes32', name: 'docId', type: 'bytes32' },
        { internalType: 'bytes32', name: 'docHash', type: 'bytes32' },
        { internalType: 'string', name: 'uri', type: 'string' },
      ],
      name: 'registerDocument',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
  dataset: [
    {
      inputs: [
        { internalType: 'bytes32', name: 'datasetId', type: 'bytes32' },
        { internalType: 'bytes32', name: 'dataHash', type: 'bytes32' },
        { internalType: 'string', name: 'uri', type: 'string' },
      ],
      name: 'registerDataset',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
  media: [
    {
      inputs: [
        { internalType: 'bytes32', name: 'mediaId', type: 'bytes32' },
        { internalType: 'bytes32', name: 'mediaHash', type: 'bytes32' },
        { internalType: 'string', name: 'uri', type: 'string' },
      ],
      name: 'registerMedia',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
};

const VERIFY_FUNCTION = {
  document: 'verifyDocument',
  dataset: 'verifyDataset',
  media: 'verifyImage',
};

const REGISTER_FUNCTION = {
  document: 'registerDocument',
  dataset: 'registerDataset',
  media: 'registerMedia',
};

const VERIFY_TYPES = {
  document: { id: 'document', label: 'Document', description: 'Certificates & contracts' },
  dataset: { id: 'dataset', label: 'Dataset', description: 'Research and ML data' },
  media: { id: 'media', label: 'Image / Video', description: 'Visual media records' },
};

const short = (value) => (value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'n/a');

function matchesType(recordType, selectedType) {
  if (!recordType) return false;
  if (selectedType === 'media') return recordType === 'media' || recordType === 'image' || recordType === 'video';
  return recordType === selectedType;
}

function getChainIdByAppChain(chainKey) {
  if (!chainKey || !CHAIN_CONFIG[chainKey]) return null;
  return CHAIN_CONFIG[chainKey].chainId;
}

function isHexHash64(value) {
  return /^0x[a-fA-F0-9]{64}$/.test((value || '').trim());
}

function getFallbackPolicy(templateType) {
  if (templateType === 'document') return 'document_only';
  if (templateType === 'dataset') return 'dataset_only';
  if (templateType === 'media' || templateType === 'image' || templateType === 'video') return 'image_video';
  return null;
}

function getRegistryPolicy(record) {
  let config = null;
  try {
    config = record?.template_config ? JSON.parse(record.template_config) : null;
  } catch {
    config = null;
  }

  const explicit = config?.content_policy || null;
  if (explicit) return { policy: explicit, enforced: true };

  return { policy: getFallbackPolicy(record?.template_type), enforced: false };
}

function inferContentKind(file) {
  const mime = (file?.mimeType || '').toLowerCase();
  const name = (file?.name || '').toLowerCase();

  if (mime.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp|tiff|heic)$/i.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(name)) return 'video';

  if (mime.includes('pdf') || mime.includes('msword') || mime.includes('officedocument.wordprocessingml') || /\.(pdf|doc|docx|txt|rtf)$/i.test(name)) return 'document';

  if (mime.includes('csv') || mime.includes('json') || mime.includes('xml') || mime.includes('excel') || mime.includes('spreadsheet') || /\.(csv|json|xml|parquet|tsv|xls|xlsx)$/i.test(name)) return 'dataset';

  return 'unknown';
}

function policyAllows(policy, kind) {
  if (!policy) return true;
  if (policy === 'document_only') return kind === 'document';
  if (policy === 'dataset_only') return kind === 'dataset';
  if (policy === 'image_only') return kind === 'image';
  if (policy === 'video_only') return kind === 'video';
  if (policy === 'image_video') return kind === 'image' || kind === 'video';
  return true;
}

function getRegistryConfig(record) {
  try {
    return record?.template_config ? JSON.parse(record.template_config) : {};
  } catch {
    return {};
  }
}

function getSignerRules(record) {
  const cfg = getRegistryConfig(record);
  const rules = Array.isArray(cfg?.signer_rules) ? cfg.signer_rules : [];
  return rules.map((r) => String(r || '').trim()).filter(Boolean);
}

function getMetadataFields(record) {
  const cfg = getRegistryConfig(record);
  const fields = Array.isArray(cfg?.metadata_fields) ? cfg.metadata_fields : [];
  return fields.map((f) => String(f || '').trim()).filter(Boolean);
}

function canUseSignerRule(rule, userRole) {
  const normalized = String(rule || '').toLowerCase();
  if (!normalized) return false;
  if (userRole === 'owner') return true;
  if (userRole === 'admin') {
    return normalized === 'admin' || normalized.endsWith('_admin') || normalized.includes('admin');
  }
  return false;
}
function isFeeCapError(error) {
  const msg = (error?.message || String(error || '')).toLowerCase();
  return msg.includes('max fee per gas less than block base fee') || (msg.includes('fee cap') && msg.includes('base fee'));
}

function formatActionError(error, fallbackTitle) {
  const raw = error?.message || String(error || 'Unknown error');
  const msg = raw.toLowerCase();

  if (msg.includes('wrong wallet network') || msg.includes('wallet session missing') || msg.includes('eip155')) {
    return raw;
  }

  if (isFeeCapError(error)) {
    return 'Network gas fee changed during submission. Please retry in a few seconds (or set wallet gas to High).';
  }

  if (msg.includes('user rejected')) {
    return 'Transaction was rejected in wallet confirmation.';
  }

  return `${fallbackTitle}: ${raw}`;
}

async function runWithFeeRetry(task) {
  try {
    return await task();
  } catch (error) {
    if (!isFeeCapError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return task();
  }
}

function getRoleForRegistry(registry, userId, membershipRole) {
  if (registry.owner_id === userId) return 'owner';
  if (membershipRole === 'admin') return 'admin';
  if (membershipRole === 'user') return 'user';
  if (registry.access_mode === 'public_read') return 'public';
  return null;
}

function canVerifyRegistry(role, accessMode) {
  if (role === 'owner' || role === 'admin' || role === 'user') return true;
  return accessMode === 'public_read';
}

function canRegisterRegistry(role) {
  return role === 'owner' || role === 'admin';
}

export default function VerifyPage() {
  const router = useRouter();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const currentChainId = useChainId();
  const { address } = useAccount();
  const { user } = useAuth();

  const [mode, setMode] = useState(MODE.VERIFY);
  const [selectedType, setSelectedType] = useState('document');
  const [file, setFile] = useState(null);
  const [manualHash, setManualHash] = useState('');
  const [assetName, setAssetName] = useState('');
  const [resourceUri, setResourceUri] = useState('');
  const [assignUsername, setAssignUsername] = useState('');
  const [metadataValues, setMetadataValues] = useState({});
  const [selectedSignerRule, setSelectedSignerRule] = useState('');
  const [fileHash, setFileHash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState(null);
  const [registries, setRegistries] = useState([]);
  const [selectedRegistryId, setSelectedRegistryId] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadRegistries() {
      if (!user || !supabase) return;

      const [{ data: allRegistries, error: regErr }, { data: memberships, error: memberErr }] = await Promise.all([
        supabase
          .from('registries')
          .select('id,owner_id,name,template_type,template_config,contract_address,chain,access_mode,deployment_status,created_at')
          .not('contract_address', 'is', null)
          .eq('deployment_status', 'deployed')
          .order('created_at', { ascending: false }),
        supabase
          .from('registry_memberships')
          .select('registry_id, role, status')
          .eq('user_id', user.id)
          .eq('status', 'active'),
      ]);

      if (!mounted) return;
      if (regErr) {
        console.error('Failed to load registries:', regErr.message);
        return;
      }
      if (memberErr) {
        console.error('Failed to load memberships:', memberErr.message);
      }

      const membershipMap = new Map((memberships || []).map((m) => [m.registry_id, m.role]));
      const enriched = (allRegistries || [])
        .map((r) => {
          const role = getRoleForRegistry(r, user.id, membershipMap.get(r.id));
          return {
            ...r,
            user_role: role,
            can_verify: canVerifyRegistry(role, r.access_mode),
            can_register: canRegisterRegistry(role),
          };
        })
        .filter((r) => r.user_role !== null);

      setRegistries(enriched);
    }

    loadRegistries();
    return () => {
      mounted = false;
    };
  }, [user]);

  const filteredRegistries = useMemo(() => {
    return registries.filter((r) => matchesType(r.template_type, selectedType));
  }, [registries, selectedType]);

  useEffect(() => {
    if (filteredRegistries.length === 0) {
      setSelectedRegistryId(null);
      return;
    }
    if (!filteredRegistries.some((r) => r.id === selectedRegistryId)) {
      setSelectedRegistryId(filteredRegistries[0].id);
    }
  }, [filteredRegistries, selectedRegistryId]);

  const selectedRegistry = useMemo(
    () => filteredRegistries.find((r) => r.id === selectedRegistryId) || null,
    [filteredRegistries, selectedRegistryId]
  );

  const signerRules = useMemo(() => getSignerRules(selectedRegistry), [selectedRegistry]);
  const metadataFields = useMemo(() => getMetadataFields(selectedRegistry), [selectedRegistry]);

  useEffect(() => {
    if (mode !== MODE.REGISTER) return;

    setMetadataValues((prev) => {
      const next = {};
      metadataFields.forEach((f) => {
        next[f] = prev[f] || '';
      });
      return next;
    });

    if (signerRules.length === 0) {
      setSelectedSignerRule('');
      return;
    }

    setSelectedSignerRule((prev) => (prev && signerRules.includes(prev) ? prev : signerRules[0]));
  }, [mode, metadataFields, signerRules]);

  const pickDocument = async () => {
    try {
      const response = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });
      if (response.assets && response.assets.length > 0) {
        setFile(response.assets[0]);
        if (!assetName.trim()) setAssetName(response.assets[0]?.name || '');
        setResult(null);
        setFileHash(null);
      }
    } catch (err) {
      Alert.alert('File pick failed', err?.message || String(err));
    }
  };

  const calculateHash = async (fileUri, fileObject) => {
    let fileContent;
    if (Platform.OS === 'web') {
      let blob;
      if (fileObject?.file) {
        blob = fileObject.file;
      } else {
        const res = await fetch(fileUri);
        blob = await res.blob();
      }

      fileContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result;
          resolve(base64data.replace(/^data:.+;base64,/, ''));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
    }

    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, fileContent);
    return `0x${digest}`;
  };

  const getVerifyHash = async () => {
    const typedHash = manualHash.trim();
    if (typedHash) {
      if (!isHexHash64(typedHash)) {
        throw new Error('Hash must be 0x + 64 hex chars.');
      }
      return typedHash;
    }

    if (!file) throw new Error('Select a file or enter a hash.');
    return calculateHash(file.uri, file);
  };

  const getRegisterHash = async () => {
    if (!file) throw new Error('Select a file to register.');
    return calculateHash(file.uri, file);
  };

  const ensureWalletOnRegistryChain = () => {
    if (!selectedRegistry?.chain) throw new Error('Select a registry first.');
    const chainId = getChainIdByAppChain(selectedRegistry.chain);
    if (!chainId) throw new Error(`Unsupported chain: ${selectedRegistry.chain}`);
    if (currentChainId !== chainId) {
      throw new Error(`Wrong wallet network. Switch wallet to eip155:${chainId}.`);
    }

    const targetCaip = `eip155:${chainId}`;
    const namespaces = wagmiAdapter?.connector?.getNamespaces?.();
    const approved = namespaces?.eip155?.chains || [];
    if (approved.length > 0 && !approved.includes(targetCaip)) {
      throw new Error(`Wallet session missing ${targetCaip}. Disconnect/reconnect wallet and approve this network.`);
    }
  };

  const resolveAssignedUser = async () => {
    const username = (assignUsername || '').trim().toLowerCase();
    if (!username) {
      const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
      return { id: user.id, username: me?.username || user.email?.split('@')[0] || 'unknown' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', username)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error(`Assigned username "${username}" does not exist.`);
    return { id: data.id, username: data.username };
  };

  const persistRecord = async ({ hash, uri, txHash, assignedUser, registeredByUsername, resolvedAssetName, signerRuleLabel, metadataJson }) => {
    if (!supabase || !user || !selectedRegistry) return;

    const ownerId = selectedRegistry.owner_id || user.id;

    const baseRecord = {
      owner_id: ownerId,
      registry_id: selectedRegistry.id,
      template_type: selectedRegistry.template_type,
      doc_id: hash,
      doc_hash: hash,
      resource_uri: uri || null,
      tx_hash: txHash,
      file_name: resolvedAssetName || file?.name || null,
      assigned_user_id: assignedUser.id,
      assigned_username: assignedUser.username,
      registered_by_user_id: user.id,
      registered_by_username: registeredByUsername,
    };

    const extendedRecord = {
      ...baseRecord,
      signer_rule_label: signerRuleLabel || null,
      metadata_json: metadataJson || null,
    };

    let { error } = await supabase.from('registry_records').insert(extendedRecord);

    if (error && /column .* does not exist/i.test(error.message || '')) {
      ({ error } = await supabase.from('registry_records').insert(baseRecord));
    }

    if (error) throw error;
  };

  const uploadAssetIfNeeded = async () => {
    const explicitUri = resourceUri.trim();
    if (explicitUri) return explicitUri;
    if (!file) return '';

    if (!supabase || !user || !selectedRegistry) {
      return file?.name || '';
    }

    const safeName = (file?.name || 'asset.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${user.id}/${selectedRegistry.id}/${Date.now()}-${safeName}`;

    let payload;
    if (Platform.OS === 'web' && file?.file) {
      payload = file.file;
    } else {
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
      const bytes = Buffer.from(base64, 'base64');
      payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }

    const contentType = file?.mimeType || 'application/octet-stream';

    const { error } = await supabase.storage
      .from(ASSET_BUCKET)
      .upload(path, payload, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });

    if (error) {
      throw new Error(`Asset upload failed (${error.message}). Ensure bucket "${ASSET_BUCKET}" exists and has insert policy for authenticated users.`);
    }

    return `supabase://${ASSET_BUCKET}/${path}`;
  };

  const handleRegister = async () => {
    if (!selectedRegistry?.contract_address) {
      Alert.alert('Missing registry', 'Select a deployed registry.');
      return;
    }
    if (!selectedRegistry?.can_register) {
      Alert.alert('Permission denied', 'Only registry owner/admin can register assets.');
      return;
    }
    if (!publicClient) {
      Alert.alert('Client unavailable', 'Wallet client is not ready.');
      return;
    }

    try {
      setBusy(true);
      ensureWalletOnRegistryChain();

      const [{ data: actorProfile }, assignedUser] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
        resolveAssignedUser(),
      ]);

      const policyInfo = getRegistryPolicy(selectedRegistry);
      if (policyInfo.enforced) {
        if (!file) {
          throw new Error('This registry enforces content type. Select a file.');
        }

        const kind = inferContentKind(file);
        if (kind === 'unknown') {
          throw new Error('Unsupported or unknown file type for strict content policy.');
        }
        if (!policyAllows(policyInfo.policy, kind)) {
          throw new Error(`File type "${kind}" is not allowed by this registry policy (${policyInfo.policy}).`);
        }
      }

            if (signerRules.length > 0) {
        if (!selectedSignerRule) {
          throw new Error('Select a signer rule for this registry.');
        }
        if (!canUseSignerRule(selectedSignerRule, selectedRegistry.user_role)) {
          throw new Error(`Signer rule "${selectedSignerRule}" is not allowed for your role (${selectedRegistry.user_role}).`);
        }
      }

      const metadataJson = {};
      for (const field of metadataFields) {
        const value = String(metadataValues[field] || '').trim();
        if (!value) {
          throw new Error(`Metadata field "${field}" is required.`);
        }
        metadataJson[field] = value;
      }
      const resolvedAssetName = (assetName || '').trim() || file?.name || null;
      if (!resolvedAssetName) {
        throw new Error('Asset name is required for registration.');
      }

      const hash = await getRegisterHash();
      setFileHash(hash);

      const uri = await uploadAssetIfNeeded();
      const txHash = await runWithFeeRetry(async () => {
        const hashTx = await writeContractAsync({
          address: selectedRegistry.contract_address,
          abi: REGISTER_ABI[selectedType],
          functionName: REGISTER_FUNCTION[selectedType],
          args: [hash, hash, uri],
        });
        setPendingTxHash(hashTx);
        return hashTx;
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await persistRecord({
        hash,
        uri,
        txHash,
        assignedUser,
        registeredByUsername: actorProfile?.username || user.email?.split('@')[0] || 'unknown',
        resolvedAssetName,
        signerRuleLabel: selectedSignerRule || null,
        metadataJson: Object.keys(metadataJson).length ? metadataJson : null,
      });

      setResult({
        ok: true,
        mode: MODE.REGISTER,
        hash,
        txHash,
        message: `Record registered on-chain and assigned to ${assignedUser.username}.`,
      });
    } catch (err) {
      setResult({ ok: false, mode: MODE.REGISTER, message: formatActionError(err, 'Registration failed') });
    } finally {
      setPendingTxHash(null);
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedRegistry?.contract_address) {
      Alert.alert('Missing registry', 'Select a deployed registry.');
      return;
    }
    if (!selectedRegistry?.can_verify) {
      Alert.alert('Permission denied', 'You do not have verification access for this registry.');
      return;
    }
    if (!publicClient) {
      Alert.alert('Client unavailable', 'Wallet client is not ready.');
      return;
    }

    try {
      setBusy(true);
      const hash = await getVerifyHash();
      setFileHash(hash);

      const verified = await publicClient.readContract({
        address: selectedRegistry.contract_address,
        abi: VERIFY_ABI[selectedType],
        functionName: VERIFY_FUNCTION[selectedType],
        args: [hash, hash],
      });

      let record = null;
      if (supabase) {
        let query = await supabase
          .from('registry_records')
          .select('resource_uri, tx_hash, created_at, file_name, assigned_username, metadata_json, signer_rule_label')
          .eq('registry_id', selectedRegistry.id)
          .eq('doc_hash', hash)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (query.error && /column .* does not exist/i.test(query.error.message || '')) {
          query = await supabase
            .from('registry_records')
            .select('resource_uri, tx_hash, created_at, file_name, assigned_username')
            .eq('registry_id', selectedRegistry.id)
            .eq('doc_hash', hash)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        }

        if (query.error) throw query.error;
        record = query.data || null;
      }

      setResult({
        ok: Boolean(verified),
        mode: MODE.VERIFY,
        hash,
        txHash: record?.tx_hash || null,
        resourceUri: record?.resource_uri || null,
        fileName: record?.file_name || null,
        metadataJson: record?.metadata_json || null,
        signerRuleLabel: record?.signer_rule_label || null,
        message: verified
          ? `Hash exists in this registry${record?.assigned_username ? ` (assigned to ${record.assigned_username})` : ''}.`
          : 'Hash not found in this registry.',
      });
    } catch (err) {
      setResult({ ok: false, mode: MODE.VERIFY, message: formatActionError(err, 'Verification failed') });
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setManualHash('');
    setAssetName('');
    setResourceUri('');
    setAssignUsername('');
    setMetadataValues({});
    setSelectedSignerRule('');
    setFileHash(null);
    setResult(null);
  };

  const renderRegistryPicker = () => (
    <View style={styles.block}>
      <Text style={styles.label}>Registry</Text>
      {filteredRegistries.length === 0 ? (
        <Text style={styles.emptyText}>No accessible deployed {selectedType} registries found.</Text>
      ) : (
        filteredRegistries.map((r) => {
          const selected = r.id === selectedRegistryId;
          return (
            <TouchableOpacity
              key={r.id}
              style={[styles.registryRow, selected && styles.registryRowSelected]}
              onPress={() => setSelectedRegistryId(r.id)}
            >
              <Text style={styles.registryName}>{r.name}</Text>
              <Text style={styles.registryMeta}>{r.chain} | {short(r.contract_address)}</Text>
              <Text style={styles.registryMeta}>role: {r.user_role} | access: {r.access_mode || 'owner_only'}</Text>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#bdc8feff', '#fef4d3ff']} style={styles.background} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Registry Actions</Text>

          <View style={styles.modeRow}>
            <TouchableOpacity style={[styles.modeChip, mode === MODE.REGISTER && styles.modeChipActive]} onPress={() => { setMode(MODE.REGISTER); setResult(null); }}>
              <Text style={styles.modeText}>Register</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modeChip, mode === MODE.VERIFY && styles.modeChipActive]} onPress={() => { setMode(MODE.VERIFY); setResult(null); }}>
              <Text style={styles.modeText}>Verify</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Template Type</Text>
            <View style={styles.typeRow}>
              {Object.values(VERIFY_TYPES).map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.typeChip, selectedType === t.id && styles.typeChipActive]}
                  onPress={() => { setSelectedType(t.id); setResult(null); }}
                >
                  <Text style={styles.typeText}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {renderRegistryPicker()}

          <View style={styles.block}>
            <Text style={styles.label}>Input</Text>
            <TouchableOpacity style={styles.fileBtn} onPress={pickDocument}>
              <Ionicons name="document-outline" size={18} color="#003262" />
              <Text style={styles.fileBtnText}>{file ? `File: ${file.name}` : 'Pick file'}</Text>
            </TouchableOpacity>
            {mode === MODE.VERIFY && (
              <TextInput
                style={styles.input}
                value={manualHash}
                onChangeText={setManualHash}
                placeholder="or paste 0x... hash"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
            {mode === MODE.REGISTER && (
              <>
                <TextInput
                  style={styles.input}
                  value={assetName}
                  onChangeText={setAssetName}
                  placeholder="Asset display name (required)"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {signerRules.length > 0 && (
                  <>
                    <Text style={styles.registryMeta}>Signer Rule</Text>
                    <View style={styles.typeRow}>
                      {signerRules.map((rule) => {
                        const selected = selectedSignerRule === rule;
                        const allowed = canUseSignerRule(rule, selectedRegistry?.user_role);
                        return (
                          <TouchableOpacity
                            key={rule}
                            style={[styles.typeChip, selected && styles.typeChipActive, !allowed && { opacity: 0.45 }]}
                            onPress={() => setSelectedSignerRule(rule)}
                          >
                            <Text style={styles.typeText}>{rule}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                {metadataFields.length > 0 && (
                  <>
                    <Text style={styles.registryMeta}>Required Metadata</Text>
                    {metadataFields.map((field) => (
                      <TextInput
                        key={field}
                        style={styles.input}
                        value={metadataValues[field] || ''}
                        onChangeText={(text) => setMetadataValues((prev) => ({ ...prev, [field]: text }))}
                        placeholder={`${field} (required)`}
                        placeholderTextColor="#666"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    ))}
                  </>
                )}

                <TextInput
                  style={styles.input}
                  value={resourceUri}
                  onChangeText={setResourceUri}
                  placeholder="Optional URI (ipfs://..., https://...)"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={styles.input}
                  value={assignUsername}
                  onChangeText={setAssignUsername}
                  placeholder="Assign to username (optional, defaults to you)"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            )}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.disabledBtn]}
            disabled={busy || !selectedRegistryId}
            onPress={mode === MODE.REGISTER ? handleRegister : handleVerify}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{mode === MODE.REGISTER ? (pendingTxHash ? 'Waiting for confirmation...' : 'Register On-Chain') : 'Verify Hash'}</Text>}
          </TouchableOpacity>

          {mode === MODE.REGISTER && selectedRegistry && !selectedRegistry.can_register ? (
            <Text style={styles.permissionText}>You are {selectedRegistry.user_role} for this registry. Only owner/admin can register.</Text>
          ) : null}

          <TouchableOpacity style={styles.secondaryBtn} onPress={resetForm}>
            <Text style={styles.secondaryText}>Clear</Text>
          </TouchableOpacity>

          {result && (
            <View style={[styles.resultCard, result.ok ? styles.okCard : styles.errCard]}>
              <Text style={styles.resultTitle}>{result.ok ? 'Success' : 'Failed'}</Text>
              <Text style={styles.resultMessage}>{result.message}</Text>
              {result.hash ? <Text style={styles.resultLine}>Hash: {short(result.hash)}</Text> : null}
              {result.txHash ? <Text style={styles.resultLine}>Tx: {short(result.txHash)}</Text> : null}
              {result.resourceUri ? <Text style={styles.resultLine}>URI: {result.resourceUri}</Text> : null}
              {result.signerRuleLabel ? <Text style={styles.resultLine}>Signer Rule: {result.signerRuleLabel}</Text> : null}
              {result.metadataJson ? <Text style={styles.resultLine}>Metadata: {JSON.stringify(result.metadataJson)}</Text> : null}
            </View>
          )}

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.replace('/home')}>
            <Text style={styles.secondaryText}>Back to Home</Text>
          </TouchableOpacity>

          <Text style={styles.footerHint}>Connected wallet: {address ? short(address) : 'not connected'}</Text>
          {fileHash ? <Text style={styles.footerHint}>Last hash: {short(fileHash)}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
  safeArea: { flex: 1, paddingTop: 10 },
  content: { paddingHorizontal: 22, paddingBottom: 120 },
  title: { fontSize: 28, color: '#003262', fontWeight: '700', textAlign: 'center', marginVertical: 10 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 14, justifyContent: 'center' },
  modeChip: { borderWidth: 1, borderColor: '#003262', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: 'rgba(125, 142, 196, 0.25)' },
  modeChipActive: { backgroundColor: '#7d8ec4' },
  modeText: { color: '#003262', fontWeight: '700' },
  block: { marginBottom: 12 },
  label: { color: '#003262', fontWeight: '700', marginBottom: 6 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { borderWidth: 1, borderColor: '#003262', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(125, 142, 196, 0.25)' },
  typeChipActive: { backgroundColor: '#7d8ec4' },
  typeText: { color: '#003262', fontWeight: '600' },
  registryRow: { borderWidth: 1, borderColor: '#003262', borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: 'rgba(125, 142, 196, 0.2)' },
  registryRowSelected: { backgroundColor: '#7d8ec4' },
  registryName: { color: '#003262', fontWeight: '700' },
  registryMeta: { color: '#003262', fontSize: 12 },
  emptyText: { color: '#003262', opacity: 0.8 },
  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#003262', borderRadius: 10, padding: 10, backgroundColor: 'rgba(255,255,255,0.4)', marginBottom: 8 },
  fileBtnText: { color: '#003262', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#003262', borderRadius: 10, padding: 10, backgroundColor: 'rgba(255,255,255,0.5)', marginBottom: 8, color: '#003262' },
  primaryBtn: { backgroundColor: '#003262', borderRadius: 20, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  disabledBtn: { opacity: 0.6 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { alignItems: 'center', marginTop: 12 },
  secondaryText: { color: '#003262', fontWeight: '600' },
  permissionText: { color: '#003262', textAlign: 'center', marginTop: 10, opacity: 0.8 },
  resultCard: { marginTop: 16, borderRadius: 12, padding: 12, borderWidth: 1 },
  okCard: { borderColor: '#2e7d32', backgroundColor: 'rgba(46,125,50,0.15)' },
  errCard: { borderColor: '#b71c1c', backgroundColor: 'rgba(183,28,28,0.12)' },
  resultTitle: { color: '#003262', fontWeight: '800', fontSize: 16, marginBottom: 4 },
  resultMessage: { color: '#003262', marginBottom: 6 },
  resultLine: { color: '#003262', fontSize: 12 },
  footerHint: { marginTop: 8, color: '#003262', opacity: 0.8, fontSize: 12, textAlign: 'center' },
});























