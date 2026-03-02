import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import WebNavBar from '../../components/WebNavBar'; 

export default function TabLayout() {
  const router = useRouter();
  const auth = useAuth();
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (!auth?.loading && !auth?.user) {
      router.replace('/auth');
    }
  }, [auth?.loading, auth?.user, router]);

  if (!auth || auth.loading) return null;

  return (
    <View style={{ flex: 1 }}>
      
      {/* 1. MASTER BACKGROUND */}
      <LinearGradient
        colors={['#bdc8feff', '#fef4d3ff']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* 2. WEB NAV BAR */}
      {isWeb && <WebNavBar />}

      {/* 3. TABS CONFIGURATION */}
      <View style={isWeb ? styles.webContainer : { flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
            
            tabBarActiveTintColor: '#004381ff', 
            tabBarInactiveTintColor: '#000000bf', 

            sceneStyle: { backgroundColor: 'transparent' }, 
            tabBarStyle: isWeb 
              ? { display: 'none' } 
              : {
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: '#7d8ec4',
                  height: 80,
                  borderTopLeftRadius: 50,
                  borderTopRightRadius: 50,
                  borderTopWidth: 0,
                  elevation: 0,
                  paddingTop: 10,
                },
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={30} color={color} />,
            }}
          />
          <Tabs.Screen
            name="create"
            options={{
              tabBarIcon: ({ color }) => <Ionicons name="add-circle-outline" size={30} color={color} />,
            }}
          />
          <Tabs.Screen
            name="verify"
            options={{
              tabBarIcon: ({ color }) => <Ionicons name="shield-checkmark-outline" size={30} color={color} />,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={30} color={color} />,
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 1000,
    alignSelf: 'center',
  },
});