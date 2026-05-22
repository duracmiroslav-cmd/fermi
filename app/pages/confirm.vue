<script setup lang="ts">
const supabase = useSupabaseClient();

onMounted(async () => {
  const { error } = await supabase.auth.exchangeCodeForSession(window.location.search);
  if (error) {
    await navigateTo('/login');
    return;
  }
  await navigateTo('/dashboard');
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <p class="text-gray-500">
      Signing in...
    </p>
  </div>
</template>
