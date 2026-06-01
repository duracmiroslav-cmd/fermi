<script setup lang="ts">
import type { AgentCapabilityEditorContext } from '~/composables/useAgentCapabilityEditor';

const props = defineProps<{
  ctx:          AgentCapabilityEditorContext;
  sectionLabel: string;
}>();

// Destructuring an object of refs preserves the refs themselves, so the
// template can auto-unwrap them directly (`{{ capability?.displayName }}`)
// rather than requiring `props.ctx.capability.value` everywhere.
const {
  agentId,
  agent,
  capability,
  pending,
  isLocked,
  lockedHint,
  statusHeadline,
  breadcrumbItems,
  isDirty,
  saving,
  attaching,
  onAttachToggle,
  onSave,
} = props.ctx;
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="breadcrumbItems"
          :loading="!capability"
        />
      </template>

      <DashboardDetailSkeleton v-if="pending && !capability" />

      <DashboardContainer v-else-if="capability">
        <header class="flex items-center gap-4">
          <div class="size-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <UIcon
              :name="getCapabilityIcon(capability.slug)"
              class="size-6 text-primary"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              {{ capability.displayName }}
            </h1>
            <p class="text-sm text-toned mt-1">
              {{ statusHeadline }}
            </p>
          </div>
          <USwitch
            :model-value="capability.attached"
            :disabled="isLocked || attaching || capability.credentialType === 'coming_soon'"
            @update:model-value="onAttachToggle"
          />
        </header>

        <p
          v-if="capability.description"
          class="text-sm text-default"
        >
          {{ capability.description }}
        </p>

        <UAlert
          v-if="lockedHint"
          icon="i-lucide-lock"
          color="warning"
          variant="subtle"
          title="A credential is required"
          :description="`Connect a provider on the Connectors page, then come back here to attach this capability to ${agent?.name ?? 'this agent'}.`"
          :actions="[{ label: lockedHint.text, to: lockedHint.to, color: 'warning', variant: 'soft', size: 'md' }]"
        />

        <section class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              {{ sectionLabel }}
            </h2>
            <div
              v-if="capability.attached"
              class="flex items-center gap-2"
            >
              <UButton
                :to="`/dashboard/agents/${agentId}/edit`"
                color="neutral"
                variant="outline"
                size="sm"
              >
                Cancel
              </UButton>
              <UButton
                size="sm"
                :loading="saving"
                :disabled="!isDirty"
                @click="onSave"
              >
                Save
              </UButton>
            </div>
          </div>

          <div :class="capability.attached ? '' : 'opacity-50 pointer-events-none'">
            <slot />
          </div>
        </section>
      </DashboardContainer>

      <DashboardContainer v-else>
        <UEmpty
          variant="subtle"
          icon="i-lucide-search-x"
          title="Capability not found"
          description="This capability does not exist for this agent, or the link is wrong."
          :actions="[{ label: 'Back to agent settings', icon: 'i-lucide-arrow-left', to: `/dashboard/agents/${agentId}/edit` }]"
        />
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
