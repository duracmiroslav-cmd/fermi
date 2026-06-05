<script setup lang="ts">
definePageMeta({ layout: false });
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb :items="[]" />
      </template>

      <div class="h-full px-6 sm:px-8 py-6 mx-auto w-full max-w-3xl">
        <FermionChat
          target-type="account"
          home
        />
      </div>
    </NuxtLayout>
  </div>
</template>
