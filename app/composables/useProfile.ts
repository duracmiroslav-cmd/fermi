import type { Tier } from '~~/shared/constants/tiers';

export interface Profile {
  id:          string;
  email:       string;
  displayName: string | null;
  avatarUrl:   string | null;
  locale:      string | null;
  timezone:    string | null;
  tier:        Tier;
}

export const useProfile = () => useState<Profile | null>('profile', () => null);
