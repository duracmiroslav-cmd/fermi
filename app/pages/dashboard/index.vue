<script setup lang="ts">
definePageMeta({ layout: false });

// The home is the owner's chat with their agents — the Default selected, others
// a switch away. It runs on the platform key (a config try-out), so there's no
// connect-a-key gate before you can talk: a brand-new owner lands here and the
// agent walks them through connecting LINE once they enter maintenance mode.
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
