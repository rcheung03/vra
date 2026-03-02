import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { decodeEventLog } from 'viem';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabaseClient';
import { TEMPLATE_PROFILES, computeConfigHash } from '../../config/templateConfig';
import { CHAIN_CONFIG, REGISTRY_FACTORY_ABI, TEMPLATE_TYPE_ID } from '../../config/factoryConfig';
import { wagmiAdapter } from '../../config/AppKitConfig';

const STEPS = {
  SELECT_TEMPLATE: 1,
  CONFIGURE: 2,
  REVIEW: 3,
  SUCCESS: 4,
};

const CONTRACT_TYPES = {
  document: {
    id: 'document',
    label: 'Document',
    description: 'Certificates, contracts, legal documents',
  },
  dataset: {
    id: 'dataset',
    label: 'Dataset',
    description: 'Research data, CSV files, databases',
  },
  media: {
    id: 'media',
    label: 'Image / Video',
    description: 'Photos, videos, and visual media verification',
  },
};

const CHAINS = [
  { id: 'ethereum', label: 'Ethereum (Sepolia)' },
  { id: 'polygon', label: 'Polygon (Amoy)' },
  { id: 'arbitrum', label: 'Arbitrum (Sepolia)' },
  { id: 'solana', label: 'Solana (Not yet supported)' },
];

const ACCESS_MODES = [
  { id: 'owner_only', label: 'Owner only' },
  { id: 'whitelist', label: 'Whitelist' },
  { id: 'public_read', label: 'Public read' },
];

const APPROVAL_COUNTS = [1, 2, 3];

const CONTENT_POLICY_OPTIONS = {
  document: [{ id: 'document_only', label: 'Document only' }],
  dataset: [{ id: 'dataset_only', label: 'Dataset only' }],
  media: [
    { id: 'image_only', label: 'Image only' },
    { id: 'video_only', label: 'Video only' },
    { id: 'image_video', label: 'Image + Video' },
  ],
};

function getDefaultContentPolicy(type) {
  if (type === 'document') return 'document_only';
  if (type === 'dataset') return 'dataset_only';
  if (type === 'media') return 'image_video';
  return '';
}

const ProgressBar = ({ currentStep }) => {
  if (currentStep === STEPS.SUCCESS) return null;

  const renderCircle = (step) => {
    const isComplete = currentStep > step;
    const active = currentStep === step;

    return (
      <View style={[styles.stepCircle, active && styles.stepCircleActive, isComplete && styles.stepCircleComplete]}>
        {isComplete ? <Ionicons name="checkmark" size={16} color="#003262" /> : <Text style={styles.stepText}>{step}</Text>}
      </View>
    );
  };

  return (
    <View style={styles.progressContainer}>
      {renderCircle(1)}
      <View style={styles.stepLine} />
      {renderCircle(2)}
      <View style={styles.stepLine} />
      {renderCircle(3)}
    </View>
  );
};

function shortHash(value) {
  if (!value) return 'Not generated';
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

async function insertRegistryRow(userId, payload) {
  const fullAttempt = await supabase.from('registries').insert({ owner_id: userId, ...payload });
  if (!fullAttempt.error) return;

  const fallbackPayload = {
    owner_id: userId,
    name: payload.name,
    template_type: payload.template_type,
    chain: payload.chain,
    contract_address: payload.contract_address,
  };

  const fallbackAttempt = await supabase.from('registries').insert(fallbackPayload);
  if (fallbackAttempt.error) {
    throw fallbackAttempt.error;
  }
}

function getRegistryCreatedFromReceipt(receipt) {
  if (!receipt?.logs?.length) return null;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: REGISTRY_FACTORY_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === 'RegistryCreated') {
        return decoded.args;
      }
    } catch {
      // Not this event
    }
  }
  return null;
}
function isFeeCapError(error) {
  const message = (error?.message || String(error || '')).toLowerCase();
  return message.includes('max fee per gas less than block base fee') || message.includes('fee cap') && message.includes('base fee');
}

function formatUserFacingError(error, fallbackTitle) {
  const raw = error?.message || String(error || 'Unknown error');
  const msg = raw.toLowerCase();

  if (msg.includes('wrong wallet network') || msg.includes('chain')) {
    return raw;
  }

  if (msg.includes('wallet session is missing') || msg.includes('missing') && msg.includes('eip155')) {
    return `${raw}\n\nUse Profile -> Disconnect, then reconnect wallet and approve requested networks.`;
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
export default function CreatePage() {
  const router = useRouter();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const currentChainId = useChainId();
  const { address, isConnected } = useAccount();
  const { user } = useAuth();

  const [currentStep, setCurrentStep] = useState(STEPS.SELECT_TEMPLATE);
  const [submitting, setSubmitting] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState(null);
  const [lastDeployment, setLastDeployment] = useState(null);
  const [configPreviewHash, setConfigPreviewHash] = useState(null);

  const [formData, setFormData] = useState({
    type: null,
    chain: null,
    name: '',
    description: '',
    profile: null,
    accessMode: 'owner_only',
    requiredApprovals: 1,
    signerRules: '',
    metadataFields: '',
    contentPolicy: '',
  });

  const profileOptions = useMemo(() => {
    if (!formData.type) return [];
    return TEMPLATE_PROFILES[formData.type] || [];
  }, [formData.type]);

  const selectedChainConfig = useMemo(() => CHAIN_CONFIG[formData.chain] || null, [formData.chain]);

  const createTemplateConfig = () => ({
    template_type: formData.type,
    profile: formData.profile,
    chain: formData.chain,
    title: formData.name,
    description: formData.description,
    access_control: formData.accessMode,
    required_approvals: Number(formData.requiredApprovals),
    signer_rules: formData.signerRules
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    metadata_fields: formData.metadataFields
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    content_policy: formData.contentPolicy || getDefaultContentPolicy(formData.type),
    wallet_address: address || null,
  });

  const validateStep = () => {
    if (currentStep === STEPS.SELECT_TEMPLATE) {
      if (!formData.type || !formData.chain) {
        Alert.alert('Missing selection', 'Select a template type and blockchain.');
        return false;
      }
      if (formData.chain === 'solana') {
        Alert.alert('Unsupported chain', 'Solana direct deployment is not wired in this build yet. Select an EVM chain.');
        return false;
      }
      return true;
    }

    if (currentStep === STEPS.CONFIGURE) {
      if (!formData.name.trim()) {
        Alert.alert('Missing title', 'Enter a registry title.');
        return false;
      }
      if (!formData.profile) {
        Alert.alert('Missing profile', 'Select a template profile.');
        return false;
      }
      if (!formData.contentPolicy) {
        Alert.alert('Missing content policy', 'Select what content this registry is allowed to accept.');
        return false;
      }
      return true;
    }

    if (currentStep === STEPS.REVIEW) {
      if (!isConnected) {
        Alert.alert('Wallet required', 'Connect your wallet before deploying.');
        return false;
      }
      if (!selectedChainConfig?.factoryAddress) {
        Alert.alert(
          'Factory not configured',
          `Set FACTORY_${formData.chain?.toUpperCase()} in app.json -> expo.extra to your deployed RegistryFactory address.`
        );
        return false;
      }
      if (!publicClient) {
        Alert.alert('Client unavailable', 'Public client is not ready for transaction confirmation.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = async () => {
    if (!validateStep()) return;

    if (currentStep === STEPS.CONFIGURE) {
      try {
        const { configHash } = await computeConfigHash(createTemplateConfig());
        setConfigPreviewHash(configHash);
      } catch (err) {
        Alert.alert('Hash failed', err.message || String(err));
        return;
      }
    }

    if (currentStep === STEPS.REVIEW) {
      await handleSubmit();
      return;
    }

    setCurrentStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to create a registry.');
      router.replace('/auth');
      return;
    }

    if (!supabase) {
      Alert.alert('Supabase not configured', 'Add SUPABASE_URL and SUPABASE_ANON_KEY in app config.');
      return;
    }

    try {
      setSubmitting(true);

      const templateConfig = createTemplateConfig();
      const { configHash, canonicalConfig } = await computeConfigHash(templateConfig);

      if (currentChainId !== selectedChainConfig.chainId) {
        throw new Error(
          `Wrong wallet network. Switch wallet to eip155:${selectedChainConfig.chainId} and try again.`
        );
      }

      const targetCaipChain = `eip155:${selectedChainConfig.chainId}`;
      const namespaces = wagmiAdapter?.connector?.getNamespaces?.();
      const approvedChains = namespaces?.eip155?.chains || [];

      if (approvedChains.length > 0 && !approvedChains.includes(targetCaipChain)) {
        throw new Error(
          `Wallet session is missing ${targetCaipChain}. Disconnect and reconnect wallet, then approve requested networks.`
        );
      }
      const txHash = await runWithFeeRetry(async () => {
        const hash = await writeContractAsync({
          address: selectedChainConfig.factoryAddress,
          abi: REGISTRY_FACTORY_ABI,
          functionName: 'createRegistry',
          args: [TEMPLATE_TYPE_ID[formData.type], configHash, formData.name.trim()],
        });
        setPendingTxHash(hash);
        return hash;
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const createdArgs = getRegistryCreatedFromReceipt(receipt);

      const contractAddress = createdArgs?.verificationRegistry || null;
      const revocationAddress = createdArgs?.revocationRegistry || null;

      if (!contractAddress) {
        throw new Error('Deployment transaction succeeded but registry address was not found in event logs.');
      }

      const insertPayload = {
        name: formData.name.trim(),
        template_type: formData.type,
        chain: formData.chain,
        contract_address: contractAddress,
        revocation_address: revocationAddress,
        deploy_tx_hash: txHash,
        config_hash: configHash,
        deployment_status: 'deployed',
        deployment_source: 'wallet_factory',
        profile: formData.profile,
        description: formData.description.trim(),
        required_approvals: Number(formData.requiredApprovals),
        access_mode: formData.accessMode,
        template_config: canonicalConfig,
      };

      await insertRegistryRow(user.id, insertPayload);

      setLastDeployment({
        status: 'deployed',
        contractAddress,
        revocationAddress,
        txHash,
        configHash,
      });
      setCurrentStep(STEPS.SUCCESS);
    } catch (err) {
      Alert.alert('Create failed', formatUserFacingError(err, 'Create failed'));
    } finally {
      setPendingTxHash(null);
      setSubmitting(false);
    }
  };

  const handleBack = () => setCurrentStep((s) => s - 1);

  const resetFlow = () => {
    setCurrentStep(STEPS.SELECT_TEMPLATE);
    setConfigPreviewHash(null);
    setLastDeployment(null);
    setFormData({
      type: null,
      chain: null,
      name: '',
      description: '',
      profile: null,
      accessMode: 'owner_only',
      requiredApprovals: 1,
      signerRules: '',
      metadataFields: '',
      contentPolicy: '',
    });
  };

  const renderTemplateSelection = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Select Template</Text>
      <Text style={styles.stepSubtitle}>Choose a registry template and deployment chain</Text>

      <View style={styles.selectionContainer}>
        {Object.values(CONTRACT_TYPES).map((item) => {
          const selected = formData.type === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.selectionBox, selected ? styles.selectedBox : styles.unselectedBox]}
              onPress={() => setFormData((prev) => ({ ...prev, type: item.id, profile: null, contentPolicy: getDefaultContentPolicy(item.id) }))}
            >
              <Text style={styles.boxLabel}>{item.label}</Text>
              <Text style={styles.boxDescription}>{item.description}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.stepSubtitle, { marginTop: 22 }]}>Choose a blockchain</Text>
      <View style={styles.chipContainer}>
        {CHAINS.map((chain) => {
          const selected = formData.chain === chain.id;
          return (
            <TouchableOpacity
              key={chain.id}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => setFormData((prev) => ({ ...prev, chain: chain.id }))}
            >
              <Text style={styles.chipText}>{chain.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderConfigure = () => (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Configure</Text>
      <Text style={styles.stepSubtitle}>Define template configuration before deployment</Text>

      <Text style={styles.inputLabel}>Registry Title</Text>
      <TextInput
        style={styles.input}
        value={formData.name}
        onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
        placeholder="Enter organization registry name"
        placeholderTextColor="#777"
      />

      <Text style={styles.inputLabel}>Description (optional)</Text>
      <TextInput
        style={styles.input}
        value={formData.description}
        onChangeText={(text) => setFormData((prev) => ({ ...prev, description: text }))}
        placeholder="What this registry is for"
        placeholderTextColor="#777"
      />

      <Text style={styles.inputLabel}>Template Profile</Text>
      <View style={styles.chipContainer}>
        {profileOptions.map((option) => {
          const selected = formData.profile === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => setFormData((prev) => ({ ...prev, profile: option.id }))}
            >
              <Text style={styles.chipText}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.inputLabel}>Content Policy</Text>
      <Text style={styles.stepSubtitle}>Enforced on new registries during file registration</Text>
      <View style={styles.chipContainer}>
        {(CONTENT_POLICY_OPTIONS[formData.type] || []).map((policy) => {
          const selected = formData.contentPolicy === policy.id;
          return (
            <TouchableOpacity
              key={policy.id}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => setFormData((prev) => ({ ...prev, contentPolicy: policy.id }))}
            >
              <Text style={styles.chipText}>{policy.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.inputLabel}>Access Mode</Text>
      <View style={styles.chipContainer}>
        {ACCESS_MODES.map((mode) => {
          const selected = formData.accessMode === mode.id;
          return (
            <TouchableOpacity
              key={mode.id}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => setFormData((prev) => ({ ...prev, accessMode: mode.id }))}
            >
              <Text style={styles.chipText}>{mode.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.inputLabel}>Required Approvals</Text>
      <View style={styles.chipContainer}>
        {APPROVAL_COUNTS.map((count) => {
          const selected = Number(formData.requiredApprovals) === count;
          return (
            <TouchableOpacity
              key={String(count)}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => setFormData((prev) => ({ ...prev, requiredApprovals: count }))}
            >
              <Text style={styles.chipText}>{count}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.inputLabel}>Signer Rules (comma-separated)</Text>
      <TextInput
        style={styles.input}
        value={formData.signerRules}
        onChangeText={(text) => setFormData((prev) => ({ ...prev, signerRules: text }))}
        placeholder="finance_admin,legal_admin"
        placeholderTextColor="#777"
      />

      <Text style={styles.inputLabel}>Metadata Fields (comma-separated)</Text>
      <TextInput
        style={styles.input}
        value={formData.metadataFields}
        onChangeText={(text) => setFormData((prev) => ({ ...prev, metadataFields: text }))}
        placeholder="issuerName,issuedAt,recordId"
        placeholderTextColor="#777"
      />
    </ScrollView>
  );

  const renderReview = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Review & Deploy</Text>
      <Text style={styles.stepSubtitle}>Deploy directly from connected wallet</Text>

      <View style={styles.reviewList}>
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Template</Text><Text style={styles.reviewValue}>{formData.type}</Text></View>
        <View style={styles.divider} />
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Profile</Text><Text style={styles.reviewValue}>{formData.profile}</Text></View>
        <View style={styles.divider} />
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Chain</Text><Text style={styles.reviewValue}>{formData.chain}</Text></View>
        <View style={styles.divider} />
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Content Policy</Text><Text style={styles.reviewValue}>{formData.contentPolicy}</Text></View>
        <View style={styles.divider} />
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Factory</Text><Text style={styles.reviewValue}>{shortHash(selectedChainConfig?.factoryAddress)}</Text></View>
        <View style={styles.divider} />
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Config Hash</Text><Text style={styles.reviewValue}>{shortHash(configPreviewHash)}</Text></View>
      </View>

      <View style={styles.walletConnectionBox}>
        <Text style={styles.walletLabel}>Wallet</Text>
        <Text style={styles.walletAddress}>{isConnected ? address : 'No wallet connected'}</Text>
      </View>
    </View>
  );

  const renderSuccess = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Registry Created</Text>
      <Text style={styles.stepSubtitle}>On-chain deployment and account linkage complete</Text>

      <View style={styles.reviewList}>
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Contract</Text><Text style={styles.reviewValue}>{shortHash(lastDeployment?.contractAddress)}</Text></View>
        <View style={styles.divider} />
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Tx Hash</Text><Text style={styles.reviewValue}>{shortHash(lastDeployment?.txHash)}</Text></View>
        <View style={styles.divider} />
        <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Config Hash</Text><Text style={styles.reviewValue}>{shortHash(lastDeployment?.configHash)}</Text></View>
      </View>

      <View style={styles.successButtonsContainer}>
        <TouchableOpacity onPress={resetFlow}><Text style={styles.textButton}>Create Another</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/home')}><Text style={styles.textButton}>Back to Home</Text></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#bdc8feff', '#fef4d3ff']} style={styles.background} />

      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.headerText}>Create a New Registry</Text>

        {currentStep !== STEPS.SUCCESS && <View style={styles.topSection}><ProgressBar currentStep={currentStep} /></View>}

        <View style={styles.mainContentWrapper}>
          {currentStep === STEPS.SELECT_TEMPLATE && renderTemplateSelection()}
          {currentStep === STEPS.CONFIGURE && renderConfigure()}
          {currentStep === STEPS.REVIEW && renderReview()}
          {currentStep === STEPS.SUCCESS && renderSuccess()}
        </View>

        {currentStep !== STEPS.SUCCESS && (
          <View style={styles.navBar}>
            <View style={styles.navStack}>
              <TouchableOpacity onPress={handleNext} disabled={submitting}>
                <Text style={styles.navTextContinue}>
                  {submitting ? (pendingTxHash ? 'Waiting for confirmation...' : 'Deploying...') : currentStep === STEPS.REVIEW ? 'Deploy & Save' : 'Continue'}
                </Text>
              </TouchableOpacity>

              {currentStep > 1 && (
                <TouchableOpacity onPress={handleBack} style={{ marginTop: 15 }} disabled={submitting}>
                  <Text style={styles.navTextBack}>Back</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
  safeArea: { flex: 1, paddingTop: 10 },
  headerText: { fontSize: 26, fontWeight: '400', color: '#003262', textAlign: 'center', marginTop: 10, marginBottom: 10 },
  topSection: { alignItems: 'center' },
  mainContentWrapper: { flex: 1, paddingHorizontal: 25 },
  progressContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  stepCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#003262' },
  stepCircleActive: { borderWidth: 2 },
  stepCircleComplete: { borderWidth: 2 },
  stepText: { color: '#003262', fontWeight: '700' },
  stepLine: { height: 1, width: 60, backgroundColor: '#003262', marginHorizontal: 5 },
  stepContent: { flex: 1, alignItems: 'center' },
  stepTitle: { fontSize: 20, fontWeight: '800', color: '#003262', textAlign: 'center', alignSelf: 'center' },
  stepSubtitle: { fontSize: 14, color: '#003262', marginBottom: 18, textAlign: 'center', alignSelf: 'center' },
  selectionContainer: { gap: 12, marginTop: 8, width: '100%' },
  selectionBox: { width: '100%', borderRadius: 18, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#7d8ec4' },
  selectedBox: { borderColor: '#003262', opacity: 1 },
  unselectedBox: { borderColor: 'transparent', opacity: 0.6 },
  boxLabel: { fontSize: 22, fontWeight: '800', color: '#003262', marginBottom: 4 },
  boxDescription: { fontSize: 13, color: '#003262' },
  scrollContainer: { flex: 1, width: '100%' },
  scrollInner: { paddingBottom: 30 },
  inputLabel: { fontSize: 16, fontWeight: '700', color: '#003262', marginBottom: 8, marginTop: 8, alignSelf: 'flex-start' },
  input: { width: '100%', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 18, padding: 12, fontSize: 15, borderWidth: 1, borderColor: '#003262', marginBottom: 10, color: '#003262' },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', width: '100%', marginBottom: 6 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: '#003262', backgroundColor: 'rgba(125,142,196,0.35)' },
  chipActive: { backgroundColor: '#7d8ec4' },
  chipText: { color: '#003262', fontWeight: '600' },
  reviewList: { width: '100%', marginTop: 10, backgroundColor: 'rgba(125,142,196,0.2)', borderRadius: 16, paddingHorizontal: 12 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11 },
  reviewLabel: { fontSize: 15, color: '#003262', fontWeight: '600' },
  reviewValue: { fontSize: 14, fontWeight: '700', color: '#003262', flexShrink: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#003262', opacity: 0.22 },
  walletConnectionBox: { width: '100%', padding: 16, backgroundColor: '#7d8ec4', borderRadius: 16, marginTop: 18 },
  walletLabel: { fontWeight: '700', color: '#003262', fontSize: 15, marginBottom: 4 },
  walletAddress: { fontSize: 12, color: '#003262', opacity: 0.85 },
  successButtonsContainer: { marginTop: 28, alignItems: 'center', gap: 16 },
  textButton: { color: '#003262', fontSize: 16, fontWeight: '600' },
  navBar: { alignItems: 'center', justifyContent: 'center', paddingBottom: 110, paddingTop: 10 },
  navStack: { alignItems: 'center' },
  navTextContinue: { fontSize: 18, color: '#003262', fontWeight: '600' },
  navTextBack: { fontSize: 16, color: '#003262', fontWeight: '400' },
});













