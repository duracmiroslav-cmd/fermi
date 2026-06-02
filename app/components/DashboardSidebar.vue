<template>
  <div class="flex flex-col h-full">
    <NuxtLink
      to="/dashboard"
      class="block px-5 py-5 font-mono text-base text-highlighted tracking-tight hover:opacity-80 transition-opacity"
    >
      fermi
    </NuxtLink>

    <nav class="flex-1 px-3 space-y-1">
      <DashboardNavItem
        to="/dashboard/bots"
        icon="i-lucide-bot"
        :label="$t('__labelBot', 2)"
      />
      <DashboardNavItem
        to="/dashboard/agents"
        icon="i-lucide-cpu"
        :label="$t('__labelAgent', 2)"
      />
      <DashboardNavItem
        to="/dashboard/connectors"
        icon="i-lucide-cable"
        :label="$t('__labelConnector', 2)"
      />
      <DashboardNavItem
        to="/dashboard/usage"
        icon="i-lucide-gauge"
        :label="$t('__labelUsage')"
      />
    </nav>

    <div class="p-3 border-t border-default">
      <DashboardUserMenu />
    </div>
  </div>
</template>
