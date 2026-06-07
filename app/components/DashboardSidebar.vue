<template>
  <div class="flex flex-col h-full">
    <NuxtLink
      to="/dashboard"
      class="block p-4 font-mono text-base text-highlighted tracking-tight hover:opacity-80 transition-opacity"
    >
      fermi
    </NuxtLink>

    <nav class="flex-1 px-2 space-y-1">
      <DashboardNavItem
        to="/dashboard"
        icon="i-lucide-cpu"
        :label="$t('__labelAgent', 2)"
        exact
      />
      <DashboardNavItem
        to="/dashboard/connectors"
        icon="i-lucide-cable"
        :label="$t('__labelConnector', 2)"
      />
    </nav>

    <div class="border-t border-default">
      <DashboardUserMenu />
    </div>
  </div>
</template>
