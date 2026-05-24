export type Tier = 'free' | 'pro';

export const BOT_LIMIT: Record<Tier, number> = {
  free: 1,
  pro: 5,
};

export const AGENT_LIMIT: Record<Tier, number> = {
  free: 3,
  pro: 20,
};
