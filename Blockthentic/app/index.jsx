// app/index.jsx
import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  Animated, 
  Platform, 
  UIManager,
  ScrollView,
  SafeAreaView,
  Easing
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useAppKit } from '@reown/appkit-react-native';
import { useAccount } from 'wagmi';
import { useAuth } from '../context/AuthContext';

// LayoutAnimation for Android (Keep this for other parts of the app if needed)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- Web-Compatible Accordion ---
const AccordionItem = ({ title, content }) => {
  const [expanded, setExpanded] = useState(false);
  const animationController = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    Animated.timing(animationController, {
      toValue: expanded ? 0 : 1,
      duration: 300,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1), 
      useNativeDriver: false, 
    }).start();
    
    setExpanded(!expanded);
  };

  const contentOpacity = animationController.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const contentMaxHeight = animationController.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 500], 
  });

  return (
    <View style={styles.accordionContainer}>
      <TouchableOpacity 
        style={styles.accordionHeader} 
        onPress={toggleExpand} 
        activeOpacity={0.7}
      >
        <Text style={styles.accordionTitle}>{title}</Text>
        <Ionicons 
          name={expanded ? "chevron-up" : "chevron-forward"} 
          size={28} 
          color="#003262"
          style={{ fontWeight: 'bold' }} 
        />
      </TouchableOpacity>
      
      {/* Animated Content Wrapper */}
      <Animated.View style={{ opacity: contentOpacity, maxHeight: contentMaxHeight, overflow: 'hidden' }}>
        <View style={styles.accordionContent}>
          <Text style={styles.accordionText}>{content}</Text>
        </View>
      </Animated.View>
      
      {/* Divider Line */}
      <View style={styles.divider} />
    </View>
  );
};

export default function Home() {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const auth = useAuth();
  
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const mainContentOpacity = fadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const openLearnMore = () => {
    setModalVisible(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true, 
    }).start();
  };

  const closeLearnMore = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setModalVisible(false));
  };

  const handleSignIn = () => {
    if (auth?.user) {
      router.replace('/home');
    } else {
      router.push('/auth');
    }
  };

  return (
    <View style={styles.container}>
      
      <View style={styles.backgroundWrapper}>  
        <LinearGradient
          colors={['#bdc8feff', '#fef4d3ff']}
          style={styles.background}
        />
      </View>

      <Animated.View 
        style={[styles.mainContent, { opacity: mainContentOpacity }]}
      >
        <View style={styles.headerSection}>
          <Text style={styles.welcomeText}>Welcome to</Text>
          <Text style={styles.brandText}>Vera</Text>
        </View>

        {isConnected && (
          <View style={styles.walletStatus}>
            <Text style={styles.connectedText}>
              Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
            </Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={openLearnMore}>
            <Text style={styles.primaryButtonText}>Learn More</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={() => open()} 
          >
            <Text style={styles.secondaryButtonText}>
              {isConnected ? 'Wallet Settings' : 'Connect Wallet'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={handleSignIn}
            disabled={auth?.loading}
          >
            <Text style={styles.secondaryButtonText}>
              {auth?.loading ? 'Loading...' : auth?.user ? 'Enter App' : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Modal
        animationType="none"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeLearnMore}
      >
        <Animated.View 
          style={[styles.absoluteFill, { opacity: fadeAnim }]}
        >
          <BlurView intensity={20} tint="light" style={styles.absoluteFill}>
            
            <View style={styles.modalContainer}>
              <LinearGradient
                colors={['#bdc8feff', '#fef4d3ff']}
                style={styles.modalContent}
              >
                <SafeAreaView style={{flex: 1}}>
                    <ScrollView 
                      contentContainerStyle={styles.scrollContent} 
                      showsVerticalScrollIndicator={false}
                    >
                      <AccordionItem 
                        title="How does this work?" 
                        content="Create a verification contract for your document. Share the contract with recipients or merge with your own platform. Verify the document's authenticity on the blockchain instantly." 
                      />
                      <AccordionItem 
                        title="How is this secure?" 
                        content="Vera leverages the immutability and transparency of blockchain technology to ensure that once a document is verified, it cannot be altered or tampered with." 
                      />
                      <AccordionItem 
                        title="Is this free?" 
                        content="Yes, getting started is free! We offer premium tiers for enterprise-level volume verification. (More details coming soon)" 
                      />
                    </ScrollView>

                  <TouchableOpacity onPress={closeLearnMore} style={styles.bottomBackButton}>
                    <Text style={styles.bottomBackText}>Back</Text>
                  </TouchableOpacity>

                </SafeAreaView>
              </LinearGradient>
            </View>
          </BlurView>
        </Animated.View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
    zIndex: -1,
    pointerEvents: 'none',
  },
  backgroundWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
    pointerEvents: 'none',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 2,
    position: 'relative'
  },
  headerSection: {
    marginBottom: 40,
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 40,
    color: '#003262',
    fontWeight: '400',
    marginBottom: 5,
  },
  brandText: {
    fontSize: 80,
    color: '#003262',
    fontWeight: '900',
    letterSpacing: -1,
    fontStyle: 'italic',
  },
  walletStatus: {
    marginBottom: 30,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(107, 136, 200, 0.2)',
    borderRadius: 20,
  },
  connectedText: {
    color: '#003262',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // --- BUTTONS ---
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    gap: 15,
  },
  primaryButton: {
    backgroundColor: '#6b88c8',
    paddingVertical: 16,
    width: '100%',
    borderRadius: 50,
    alignItems: 'center',
    shadowColor: '#6b88c8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '400',
  },
  secondaryButton: {
    backgroundColor: '#6b88c8',
    paddingVertical: 16,
    width: '100%',
    borderRadius: 50,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '400',
  },

  // --- MODAL ---
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '100%',
    height: '100%',
  },
  modalContent: {
    flex: 1,
  },
  
  // --- ACCORDION  ---
  scrollContent: {
    paddingHorizontal: 25,
    flexGrow: 1, 
    justifyContent: 'center',
    width: '100%',     
    maxWidth: 800,      
    alignSelf: 'center' 
  },
  
  accordionContainer: {
    marginBottom: 15,
    marginLeft: 10,
    marginRight: 10,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
  },
  accordionTitle: {
    fontSize: 24,
    color: '#003262',
    fontWeight: '400',
  },
  accordionContent: {
    paddingVertical: 10,
  },
  accordionText: {
    fontSize: 16,
    color: '#34495E',
    lineHeight: 24,
  },
  divider: {
    height: 2, 
    backgroundColor: '#003262',
    marginTop: 5,
  },
  bottomBackButton: {
    alignSelf: 'center',
    marginBottom: 50,
    padding: 20, 
  },
  bottomBackText: {
    fontSize: 18,
    color: '#003262',
    fontWeight: '500',
  }
});