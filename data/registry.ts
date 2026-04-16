"use client";

import { MOCK_PICKS } from "./picks";
import { MOCK_USER, User } from "./User";

/**
 * Check if pick is unlocked
 */
export const isPickUnlocked = (user: User | null, pickId: string): boolean => {
  if (!user) return false;
  return user.unlockedPickIds.includes(pickId);
};

/**
 * Get all unlocked picks
 */
export const getUnlockedPicks = () => {
  return MOCK_PICKS.filter((pick) =>
    MOCK_USER.unlockedPickIds.includes(pick.id)
  );
};

/**
 * 🔥 REAL HISTORY (REPLACES MOCK DATA)
 */
export const getUnlockHistory = (user: User | null) => {
  if (!user) return [];

  return MOCK_PICKS
    .filter((pick) => user.unlockedPickIds.includes(pick.id))
    .map((pick) => ({
      id: pick.id,
      title: pick.title,
      price: `${pick.price.toLocaleString("fr-FR")} FCFA`,
      date: new Date(pick.match_date).toLocaleDateString("fr-FR"),
      outcome: pick.outcome,
      matches: pick.matches, // 🔥 FIX: required for dropdown details
    }));
};