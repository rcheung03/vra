import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../config/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function handleAuthLink(url) {
      if (!supabase || !url) return;
      try {
        const parsed = Linking.parse(url);
        const code = parsed?.queryParams?.code;
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          return;
        }
        const hash = url.includes('#') ? url.split('#')[1] : '';
        if (hash) {
          const params = new URLSearchParams(hash);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }
        }
      } catch (error) {
        console.error('Deep link auth error:', error?.message ?? error);
      }
    }

    async function loadSession() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        console.error('Supabase session error:', error.message);
      }
      setSession(data?.session ?? null);
      setLoading(false);
    }

    loadSession();
    Linking.getInitialURL().then(handleAuthLink);

    if (!supabase) return () => {};

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    const urlListener = Linking.addEventListener('url', (event) => handleAuthLink(event.url));

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
      urlListener?.remove?.();
    };
  }, []);

  const signIn = async ({ email, password }) => {
    if (!supabase) {
      Alert.alert('Supabase not configured', 'Please add SUPABASE_URL and SUPABASE_ANON_KEY.');
      return { error: new Error('Supabase not configured') };
    }
    return await supabase.auth.signInWithPassword({ email, password });
  };

  const signUp = async ({ email, password, username }) => {
    if (!supabase) {
      Alert.alert('Supabase not configured', 'Please add SUPABASE_URL and SUPABASE_ANON_KEY.');
      return { error: new Error('Supabase not configured') };
    }

    const normalizedUsername = (username || '').trim().toLowerCase();
    if (!normalizedUsername) {
      return { error: new Error('Username is required.') };
    }

    const usernamePattern = /^[a-z0-9_]{3,30}$/;
    if (!usernamePattern.test(normalizedUsername)) {
      return { error: new Error('Username must be 3-30 chars and use only lowercase letters, numbers, or _.') };
    }

    const { data: existing, error: existingError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', normalizedUsername)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return { error: new Error(existingError.message || 'Failed to validate username.') };
    }

    if (existing) {
      return { error: new Error('Username already taken. Choose another one.') };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: normalizedUsername },
        emailRedirectTo: Linking.createURL('auth'),
      },
    });

    if (error) {
      const message = (error.message || '').toLowerCase();
      if (message.includes('duplicate key') && message.includes('username')) {
        return { error: new Error('Username already taken. Choose another one.') };
      }
      return { error };
    }

    return { data };
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    loading,
    signIn,
    signUp,
    signOut,
  }), [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
