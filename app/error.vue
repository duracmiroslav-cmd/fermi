<script setup lang="ts">
defineProps<{
  error: { statusCode: number; message?: string };
}>();

const handleError = () => clearError({ redirect: '/' });
</script>

<template>
  <div class="bg-default text-default min-h-screen flex flex-col items-center justify-center gap-4 px-4">
    <h1 class="font-mono text-4xl font-bold">
      {{ error.statusCode }}
    </h1>
    <p class="text-muted">
      {{ error.message || (error.statusCode === 404 ? 'Page not found' : 'Something went wrong') }}
    </p>
    <UButton
      color="neutral"
      variant="outline"
      @click="handleError"
    >
      Go home
    </UButton>
  </div>
</template>
