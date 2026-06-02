<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

const { t } = useI18n();
const supabase = useSupabaseClient();
const user = useSupabaseUser();
const profile = useProfile();

const avatarUrl = computed(() => user.value?.user_metadata?.avatar_url as string | undefined);
const email = computed(() => user.value?.email ?? '');
const name = computed(() => {
  const meta = user.value?.user_metadata ?? {};
  return (meta.full_name as string) || (meta.name as string) || profile.value?.displayName || email.value;
});
const initial = computed(() => (name.value.charAt(0) || '?').toUpperCase());
const tierLabel = computed(() =>
  profile.value?.tier === 'pro' ? t('__labelTierPro') : t('__labelTierFree'),
);

const signOut = async () => {
  await supabase.auth.signOut();
  await navigateTo('/sign-in');
};

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: t('__titleSettings'), icon: 'i-lucide-settings', to: '/dashboard/settings' }],
  [{ label: t('__actionSignOut'), icon: 'i-lucide-log-out', onSelect: signOut }],
]);
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ side: 'top', align: 'start', sideOffset: 8 }"
    :ui="{ content: 'min-w-60' }"
  >
    <button
      type="button"
      class="flex items-center gap-3 w-full rounded-lg p-2 text-left cursor-pointer hover:bg-elevated transition-colors"
    >
      <UAvatar
        :src="avatarUrl"
        :alt="name"
        :text="initial"
        size="sm"
      />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">
          {{ name }}
        </p>
        <p class="text-xs text-toned truncate">
          {{ tierLabel }}
        </p>
      </div>
      <UIcon
        name="i-lucide-chevrons-up-down"
        class="size-4 text-muted shrink-0"
      />
    </button>

    <template #content-top>
      <div class="flex items-center gap-3 px-2 py-3 mb-1 border-b border-default">
        <UAvatar
          :src="avatarUrl"
          :alt="name"
          :text="initial"
          size="md"
        />
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">
            {{ name }}
          </p>
          <p class="text-xs text-toned truncate">
            {{ tierLabel }}
          </p>
        </div>
      </div>
    </template>
  </UDropdownMenu>
</template>
