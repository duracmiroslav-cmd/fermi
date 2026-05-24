<template>
  <div class="flex flex-col h-full">
    <NuxtLink
      to="/dashboard"
      class="block px-5 py-5 hover:opacity-80 transition-opacity"
    >
      <div class="flex items-baseline gap-2 font-mono">
        <span class="text-base text-highlighted tracking-tight">fermi</span>
        <span class="text-xs text-dimmed">v0.1</span>
      </div>
    </NuxtLink>

    <nav class="flex-1 px-3 space-y-0.5">
      <DashboardNavItem
        to="/dashboard/bots"
        icon="i-lucide-bot"
        label="bots"
      />
      <DashboardNavItem
        to="/dashboard/agents"
        icon="i-lucide-cpu"
        label="agents"
      />
      <DashboardNavItem
        to="/dashboard/connections"
        icon="i-lucide-cable"
        label="connections"
      />
      <DashboardNavItem
        to="/dashboard/settings"
        icon="i-lucide-sliders-horizontal"
        label="settings"
      />
    </nav>

    <div class="border-t border-default p-3">
      <DashboardUserMenu />
    </div>
  </div>
</template>
