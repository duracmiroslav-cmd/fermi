<template>
  <div
    class="rounded-md ring ring-inset ring-muted bg-elevated/50 divide-y divide-default"
    aria-busy="true"
    aria-live="polite"
  >
    <div class="p-4 sm:px-6">
      <div class="h-6 flex items-center">
        <USkeleton class="h-4 w-28" />
      </div>
    </div>
    <div class="p-4 sm:p-6 space-y-4">
      <div>
        <div class="h-5 flex items-center">
          <USkeleton class="h-3 w-full bg-muted/70" />
        </div>
        <div class="h-5 flex items-center">
          <USkeleton class="h-3 w-3/4 bg-muted/70" />
        </div>
      </div>
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <USkeleton class="flex-1 h-9 rounded-md bg-muted/40" />
          <USkeleton class="h-9 w-24 rounded-md bg-muted/60" />
        </div>
        <div class="h-4 flex items-center">
          <USkeleton class="h-2.5 w-64 bg-muted/50" />
        </div>
      </div>
    </div>
  </div>
</template>
