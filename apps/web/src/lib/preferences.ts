import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@trader/shared";
import { api } from "../../../../convex/_generated/api";
import { convex } from "./convex";

export const PREFERENCES_KEY = ["preferences"];

export const fetchPreferences = () =>
  convex.query(api.preferences.get, {}) as Promise<UserPreferences>;

export const savePreferences = (patch: Partial<UserPreferences>) =>
  convex.mutation(api.preferences.update, patch) as Promise<UserPreferences>;

export const resetPreferences = () =>
  convex.mutation(api.preferences.reset, {}) as Promise<UserPreferences>;

/**
 * Preferences are read by several screens, so they resolve to the defaults
 * while loading and for guests instead of making every caller handle a null.
 */
export function usePreferences() {
  const query = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: fetchPreferences,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { prefs: query.data ?? DEFAULT_PREFERENCES, loaded: query.isSuccess };
}

export function useSavePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: savePreferences,
    onSuccess: (next) => {
      qc.setQueryData(PREFERENCES_KEY, next);
      // Screens that read a preference at mount need their data refetched.
      qc.invalidateQueries({ queryKey: ["intelligence"] });
    },
  });
}

export function useResetPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resetPreferences,
    onSuccess: (next) => {
      qc.setQueryData(PREFERENCES_KEY, next);
      qc.invalidateQueries({ queryKey: ["intelligence"] });
    },
  });
}
