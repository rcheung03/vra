import * as Crypto from 'expo-crypto';

export const TEMPLATE_PROFILES = {
  document: [
    { id: 'academic', label: 'Academic' },
    { id: 'legal', label: 'Legal' },
    { id: 'medical', label: 'Medical' },
    { id: 'general', label: 'General' },
  ],
  dataset: [
    { id: 'research', label: 'Research' },
    { id: 'government', label: 'Government' },
    { id: 'ml', label: 'ML' },
    { id: 'general', label: 'General' },
  ],
  media: [
    { id: 'photography', label: 'Photography' },
    { id: 'media', label: 'Media' },
    { id: 'nft', label: 'NFT' },
    { id: 'general', label: 'General' },
  ],
};

function sortObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectDeep);
  }

  if (value && typeof value === 'object') {
    const sorted = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        sorted[key] = sortObjectDeep(value[key]);
      });
    return sorted;
  }

  return value;
}

export function canonicalizeConfig(config) {
  return JSON.stringify(sortObjectDeep(config));
}

export async function computeConfigHash(config) {
  const canonical = canonicalizeConfig(config);
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical);
  return {
    configHash: `0x${digest}`,
    canonicalConfig: canonical,
  };
}
