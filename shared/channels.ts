import type { SupabaseClient } from '@supabase/supabase-js';

export interface ChannelRef {
  id: string;
  ownerId: string;
}

export const findChannelByDestination = async (
  admin: SupabaseClient,
  channelType: string,
  destination: string,
): Promise<ChannelRef | null> => {
  const { data, error } = await admin
    .from('channels')
    .select('id, owner_id')
    .eq('channel_type', channelType)
    .eq('external_id', destination)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, ownerId: data.owner_id } : null;
};

export const findChannelById = async (
  admin: SupabaseClient,
  channelId: string,
): Promise<ChannelRef | null> => {
  const { data, error } = await admin
    .from('channels')
    .select('id, owner_id')
    .eq('id', channelId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, ownerId: data.owner_id } : null;
};
