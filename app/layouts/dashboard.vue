<script setup lang="ts">
const drawerOpen = ref(false);
const route = useRoute();

watch(() => route.path, () => {
  drawerOpen.value = false;
});
</script>

<template>
  <div class="bg-default text-default min-h-screen flex">
    <aside class="hidden md:flex flex-col w-60 border-r border-default shrink-0">
      <DashboardSidebar />
    </aside>

    <USlideover
      v-model:open="drawerOpen"
      side="left"
    >
      <template #content>
        <div class="h-full bg-default w-60">
          <DashboardSidebar />
        </div>
      </template>
    </USlideover>

    <div class="flex-1 flex flex-col min-w-0">
      <header class="border-b border-default px-4 sm:px-8 h-14 flex items-center gap-4 shrink-0">
        <button
          type="button"
          class="md:hidden text-muted hover:text-highlighted transition-colors"
          aria-label="Open menu"
          @click="drawerOpen = true"
        >
          <UIcon
            name="i-lucide-menu"
            class="size-5"
          />
        </button>
        <h1 class="flex-1 font-mono text-base text-highlighted tracking-tight truncate">
          <slot name="title">dashboard</slot>
        </h1>
        <div class="flex items-center gap-2">
          <slot name="actions" />
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>

      <footer
        v-if="$slots.footer"
        class="border-t border-default bg-default px-4 sm:px-8 py-3 flex items-center justify-end gap-3 shrink-0"
        style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));"
      >
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>
