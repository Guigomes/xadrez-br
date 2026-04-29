'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/database';

const supabase = createClient();

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export function useProfile() {
  const { user } = useUser();
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async (): Promise<UserProfile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 300_000,
  });
}

export function useSignIn() {
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
  });
}

export function useSignUp() {
  return useMutation({
    mutationFn: async ({ email, password, fullName }: { email: string; password: string; fullName: string }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}

export function usePlayerFollow(playerId: string, tournamentId?: string) {
  const { user } = useUser();
  const qc = useQueryClient();

  const { data: isFollowing } = useQuery({
    queryKey: ['follow', user?.id, playerId, tournamentId],
    queryFn: async () => {
      if (!user) return false;
      const query = supabase
        .from('player_follows')
        .select('id')
        .eq('user_id', user.id)
        .eq('player_id', playerId);
      if (tournamentId) query.eq('tournament_id', tournamentId);
      else query.is('tournament_id', null);
      const { data } = await query.single();
      return !!data;
    },
    enabled: !!user,
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (isFollowing) {
        const query = supabase
          .from('player_follows')
          .delete()
          .eq('user_id', user.id)
          .eq('player_id', playerId);
        if (tournamentId) query.eq('tournament_id', tournamentId);
        else query.is('tournament_id', null);
        const { error } = await query;
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('player_follows')
          .insert({ user_id: user.id, player_id: playerId, tournament_id: tournamentId ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow', user?.id, playerId, tournamentId] });
    },
  });

  return { isFollowing: isFollowing ?? false, toggleFollow, user };
}
