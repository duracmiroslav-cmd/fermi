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
        label="Bots"
      />
      <DashboardNavItem
        to="/dashboard/agents"
        icon="i-lucide-cpu"
        label="Agents"
      />
      <DashboardNavItem
        to="/dashboard/connections"
        icon="i-lucide-cable"
        label="Connections"
      />
      <DashboardNavItem
        to="/dashboard/usage"
        icon="i-lucide-gauge"
        label="Usage"
      />
    </nav>

    <div class="p-3">
      <DashboardUserMenu />
    </div>
  </div>
</template>
