<script setup lang="ts">
definePageMeta({ layout: false });
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb :items="[]" />
      </template>

      <DashboardContainer>
        <p class="text-sm text-toned">
          {{ $t('__descriptionPickFromSidebar') }}
        </p>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
