<template>
  <NuxtLayout name="dashboard">
    <template #title>
      <DashboardBreadcrumb :items="[]" />
    </template>

    <div class="p-6 sm:p-8">
      <p class="text-sm text-muted">
        Pick a section from the sidebar to get started.
      </p>
    </div>
  </NuxtLayout>
</template>
