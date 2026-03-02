import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function WebNavBar() {
  const router = useRouter();
  const pathname = usePathname();

  const tabs = [
    { name: 'Home', route: '/home', icon: 'home-outline' },
    { name: 'Create Registry', route: '/create', icon: 'add-circle-outline' },
    { name: 'Register/Verify', route: '/verify', icon: 'shield-checkmark-outline' },
    { name: 'Profile', route: '/profile', icon: 'person-outline' },
  ];

  return (
    <View style={styles.navContainer}>
      <View style={styles.navContent}>
        {/* Logo */}
        <TouchableOpacity onPress={() => router.push('/home')}>
          <Text style={styles.brandText}>Vera</Text>
        </TouchableOpacity>

        {/* Navigation Links */}
        <View style={styles.linkContainer}>
          {tabs.map((tab) => {
            // Check if this tab is active
            const isActive = pathname.includes(tab.route);
            return (
              <TouchableOpacity 
                key={tab.name}
                style={[styles.linkItem, isActive && styles.activeLink]}
                onPress={() => router.push(tab.route)}
              >
                <Ionicons 
                  name={tab.icon} 
                  size={20} 
                  color={isActive ? '#003262' : '#00072bff'} 
                />
                <Text style={[styles.linkText, isActive && styles.activeText]}>
                  {tab.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    width: '100%',
    backgroundColor: '#a4b6ffff', 
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 50, 98, 0.1)',
    height: 65,
    justifyContent: 'center',
    zIndex: 100,
  },
  navContent: {
    maxWidth: 1000, // inner content centered
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  brandText: {
    fontSize: 28,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#001F54',
  },
  linkContainer: {
    flexDirection: 'row',
    gap: 15,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 8,
  },
  activeLink: {
    backgroundColor: '#6B88C8',
  },
  linkText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#00072bff',
  },
  activeText: {
    color: '#003262',
    fontWeight: '500',
  },
});