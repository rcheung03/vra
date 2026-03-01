const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// 1. Enable modern Package Exports (Needed for Wagmi/Web3)
config.resolver.unstable_enablePackageExports = true;
config.resolver.sourceExts.push('mjs', 'cjs');

// 2. The Safe Fallback Resolver
config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    // Try to resolve the module normally first.
    // THIS is what keeps 'tslib' and your core React Native files safe!
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    // If standard resolution fails, AND it's looking for a literal .js file...
    if (moduleName.endsWith('.js')) {
      try {
        // ...rescue it by looking for the .ts file instead (Fixes ox and porto!)
        return context.resolveRequest(context, moduleName.replace(/\.js$/, '.ts'), platform);
      } catch (fallbackError) {
        // If the fallback also fails, just throw the original error
      }
    }
    throw error;
  }
};

module.exports = config;