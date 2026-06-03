<script setup lang="ts">
// Loading placeholder for the wide two-column detail pages (agent + bot).
// Deliberately generic: a header plus four identical cards in a 2-col grid.
// It does NOT mirror each page's exact card count or heights — that coupling
// made the skeleton churn on every layout tweak. The goal here is only to
// hold the wide width and two-column shape so the page doesn't reflow on load.
</script>

<template>
  <DashboardContainer
    wide
    aria-busy="true"
    aria-live="polite"
  >
    <!-- Header: avatar + title + action -->
    <div class="flex items-center gap-4">
      <USkeleton class="size-12 rounded-full shrink-0" />
      <div class="flex-1 min-w-0 h-8 flex items-center">
        <USkeleton class="h-5 w-48" />
      </div>
      <USkeleton class="h-8 w-20 rounded-md bg-muted/60 shrink-0" />
    </div>

    <!-- Uniform two-column card grid -->
    <div class="grid gap-6 lg:grid-cols-2">
      <USkeleton
        v-for="i in 4"
        :key="i"
        class="h-56 w-full rounded-md"
      />
    </div>
  </DashboardContainer>
</template>
