<script setup lang="ts">
const supabase = useSupabaseClient();
const user = useSupabaseUser();

const signOut = async () => {
  await supabase.auth.signOut();
  await navigateTo('/sign-in');
};
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-4">
    <h1 class="text-2xl font-bold">
      Dashboard
    </h1>
    <p class="text-muted">
      {{ user?.email }}
    </p>
    <UButton
      color="neutral"
      variant="outline"
      @click="signOut"
    >
      Sign out
    </UButton>
  </div>
</template>
