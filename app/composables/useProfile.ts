export interface Profile {
  id:          string;
  email:       string;
  displayName: string | null;
  avatarUrl:   string | null;
  locale:      string | null;
  timezone:    string | null;
}

export const useProfile = () => useState<Profile | null>('profile', () => null);
