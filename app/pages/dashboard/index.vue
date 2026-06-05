<script setup lang="ts">
definePageMeta({ layout: false });
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb :items="[]" />
      </template>

      <div class="h-full px-6 sm:px-8 py-6 w-full">
        <FermionChat home />
      </div>
    </NuxtLayout>
  </div>
</template>
