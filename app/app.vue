<template>
  <UApp :toaster="{ duration: 8000 }">
    <div class="bg-default text-default min-h-screen">
      <NuxtRouteAnnouncer />
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>
  </UApp>
</template>
