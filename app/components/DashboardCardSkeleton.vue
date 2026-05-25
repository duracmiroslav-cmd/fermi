<template>
  <div
    class="rounded-md border border-muted bg-elevated/50 animate-pulse divide-y divide-default"
    aria-busy="true"
    aria-live="polite"
  >
    <div class="p-4 sm:px-6">
      <div class="h-6 flex items-center">
        <div class="h-4 w-28 rounded bg-muted" />
      </div>
    </div>
    <div class="p-4 sm:p-6 space-y-4">
      <div>
        <div class="h-5 flex items-center">
          <div class="h-3 w-full rounded bg-muted/70" />
        </div>
        <div class="h-5 flex items-center">
          <div class="h-3 w-3/4 rounded bg-muted/70" />
        </div>
      </div>
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div class="flex-1 h-9 rounded-md bg-muted/40" />
          <div class="h-9 w-24 rounded-md bg-muted/60" />
        </div>
        <div class="h-4 flex items-center">
          <div class="h-2.5 w-64 rounded bg-muted/50" />
        </div>
      </div>
    </div>
  </div>
</template>
