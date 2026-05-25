<template>
  <UApp :toaster="{ duration: 8000 }">
    <div class="bg-default min-h-screen">
      <NuxtRouteAnnouncer />
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>
  </UApp>
</template>
