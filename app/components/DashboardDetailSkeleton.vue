<template>
  <DashboardContainer
    aria-busy="true"
    aria-live="polite"
  >
    <div class="flex items-center gap-4">
      <USkeleton class="size-12 rounded-full shrink-0" />
      <div class="h-8 flex items-center">
        <USkeleton class="h-5 w-48" />
      </div>
    </div>

    <div
      v-for="i in 3"
      :key="i"
      class="space-y-2"
    >
      <div class="h-5 flex items-center">
        <USkeleton class="h-3 w-24" />
      </div>
      <USkeleton class="h-9 w-full rounded-md bg-muted/40" />
    </div>

    <div class="space-y-2">
      <div class="h-5 flex items-center">
        <USkeleton class="h-3 w-16" />
      </div>
      <USkeleton class="h-24 w-full rounded-md bg-muted/40" />
    </div>
  </DashboardContainer>
</template>
