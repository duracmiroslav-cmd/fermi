export type Tier = 'free' | 'pro';

export const CHANNEL_LIMIT: Record<Tier, number> = {
  free: 1,
  pro: 5,
};
