'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

function preferenceKey(slug: string) {
  return `gambito:tournament:${slug}:group`;
}

export function resolveTournamentGroup(
  availableGroupIds: string[],
  groupFromUrl: string | null | undefined,
  rememberedGroupId: string | null,
) {
  if (groupFromUrl && availableGroupIds.includes(groupFromUrl)) return groupFromUrl;
  if (rememberedGroupId && availableGroupIds.includes(rememberedGroupId)) return rememberedGroupId;
  return availableGroupIds[0] ?? null;
}

export function useTournamentGroupPreference(
  slug: string,
  groupFromUrl: string | null | undefined,
  availableGroupIds: string[],
) {
  const [rememberedGroupId, setRememberedGroupId] = useState<string | null>(null);
  const storageKey = useMemo(() => preferenceKey(slug), [slug]);

  useEffect(() => {
    const validUrlGroup = groupFromUrl && availableGroupIds.includes(groupFromUrl)
      ? groupFromUrl
      : null;

    try {
      if (validUrlGroup) {
        window.localStorage.setItem(storageKey, validUrlGroup);
        setRememberedGroupId(validUrlGroup);
        return;
      }

      const storedGroup = window.localStorage.getItem(storageKey);
      setRememberedGroupId(
        storedGroup && availableGroupIds.includes(storedGroup) ? storedGroup : null,
      );
    } catch {
      setRememberedGroupId(null);
    }
  }, [availableGroupIds, groupFromUrl, storageKey]);

  const rememberGroup = useCallback((groupId: string) => {
    if (!availableGroupIds.includes(groupId)) return;
    setRememberedGroupId(groupId);
    try {
      window.localStorage.setItem(storageKey, groupId);
    } catch {
      // Browsers may block storage; the URL still preserves the selection.
    }
  }, [availableGroupIds, storageKey]);

  return {
    selectedGroupId: resolveTournamentGroup(availableGroupIds, groupFromUrl, rememberedGroupId),
    rememberGroup,
  };
}
