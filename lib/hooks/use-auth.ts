'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { isLocallyFollowed, toggleLocalFollow, getLocalFollowedPlayerIds } from '@/lib/utils/local-follows';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/database';

let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!_client) _client = createClient();
  return _client;
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClient().auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: { subscription } } = getClient().auth.onAuthStateChange((_event, session) => {
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
      const { data, error } = await getClient()
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
      const { data, error } = await getClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
  });
}

export function useSignUp() {
  return useMutation({
    mutationFn: async ({ email, password, fullName }: { email: string; password: string; fullName: string }) => {
      const { data, error } = await getClient().auth.signUp({
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
      const { error } = await getClient().auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      qc.clear();
    },
  });
}

export function useFollowedInTournament(tournamentId: string) {
  const { user, loading } = useUser();
  const qc = useQueryClient();

  useEffect(() => {
    if (user) return;
    const handler = () =>
      qc.invalidateQueries({ queryKey: ['followed-in-tournament', 'local', tournamentId] });
    window.addEventListener('xbr:follows:changed', handler);
    return () => window.removeEventListener('xbr:follows:changed', handler);
  }, [user, tournamentId, qc]);

  return useQuery({
    queryKey: ['followed-in-tournament', user?.id ?? 'local', tournamentId],
    enabled: !loading && !!tournamentId,
    staleTime: 30_000,
    queryFn: async () => {
      let playerIds: Set<string>;

      if (user) {
        const { data: follows } = await getClient()
          .from('player_follows')
          .select('player_id')
          .eq('user_id', user.id)
          .eq('tournament_id', tournamentId);
        playerIds = new Set<string>((follows ?? []).map((f) => f.player_id));
      } else {
        playerIds = getLocalFollowedPlayerIds(tournamentId);
      }

      if (!playerIds.size) return { playerIds, tpIds: new Set<string>() };

      const { data: tps } = await getClient()
        .from('tournament_players')
        .select('id')
        .eq('tournament_id', tournamentId)
        .in('player_id', [...playerIds]);

      const tpIds = new Set<string>((tps ?? []).map((tp) => tp.id));
      return { playerIds, tpIds };
    },
  });
}

export function usePlayerFollow(playerId: string, tournamentId?: string) {
  const { user } = useUser();
  const qc = useQueryClient();

  const [localFollowing, setLocalFollowing] = useState(false);
  useEffect(() => {
    setLocalFollowing(isLocallyFollowed(playerId, tournamentId ?? null));
  }, [playerId, tournamentId]);

  const { data: dbFollowing } = useQuery({
    queryKey: ['follow', user?.id, playerId, tournamentId],
    queryFn: async () => {
      if (!user) return false;
      const query = getClient()
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

  const isFollowing = user ? (dbFollowing ?? false) : localFollowing;

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (!user) {
        const next = toggleLocalFollow(playerId, tournamentId ?? null);
        setLocalFollowing(next);
        return;
      }
      if (isFollowing) {
        const query = getClient()
          .from('player_follows')
          .delete()
          .eq('user_id', user.id)
          .eq('player_id', playerId);
        if (tournamentId) query.eq('tournament_id', tournamentId);
        else query.is('tournament_id', null);
        const { error } = await query;
        if (error) throw error;
      } else {
        const { error } = await getClient()
          .from('player_follows')
          .insert({ user_id: user.id, player_id: playerId, tournament_id: tournamentId ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      if (user) {
        qc.invalidateQueries({ queryKey: ['follow', user?.id, playerId, tournamentId] });
      }
    },
  });

  return { isFollowing, toggleFollow, user };
}
