<script setup lang="ts">
const supabase = useSupabaseClient();
const user = useSupabaseUser();

const avatarUrl = computed(() => user.value?.user_metadata?.avatar_url as string | undefined);
const email = computed(() => user.value?.email ?? '');
const initial = computed(() => email.value.charAt(0).toUpperCase() || '?');

const signOut = async () => {
  await supabase.auth.signOut();
  await navigateTo('/sign-in');
};
</script>

<template>
  <div class="flex items-center gap-3">
    <UAvatar
      :src="avatarUrl"
      :alt="email"
      :text="initial"
      size="sm"
    />
    <span class="flex-1 min-w-0 font-mono text-xs text-muted truncate">
      {{ email }}
    </span>
    <UTooltip text="Sign out">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-log-out"
        size="sm"
        aria-label="Sign out"
        @click="signOut"
      />
    </UTooltip>
  </div>
</template>
