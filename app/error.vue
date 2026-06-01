<script setup lang="ts">
const props = defineProps<{
  error: { statusCode: number; message?: string };
}>();

const { t } = useI18n();

const fallbackMessage = computed(() =>
  props.error.statusCode === 404
    ? t('__descriptionPageNotFound')
    : t('__descriptionSomethingWentWrong'),
);

const handleError = () => clearError({ redirect: '/' });
</script>

<template>
  <div class="bg-default min-h-screen flex flex-col items-center justify-center gap-4 px-4">
    <h1 class="font-mono text-4xl font-bold">
      {{ error.statusCode }}
    </h1>
    <p class="text-toned">
      {{ error.message || fallbackMessage }}
    </p>
    <UButton
      color="neutral"
      variant="outline"
      @click="handleError"
    >
      {{ $t('__actionGoHome') }}
    </UButton>
  </div>
</template>
