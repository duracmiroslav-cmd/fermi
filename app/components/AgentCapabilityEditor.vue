<script setup lang="ts">
import type { AgentCapabilityEditorContext } from '~/composables/useAgentCapabilityEditor';

const props = defineProps<{
  ctx:          AgentCapabilityEditorContext;
  // Null when the capability has nothing to configure (no tools, no
  // settings) — section + body slot are skipped entirely so the page
  // doesn't show an empty "Tools" header.
  sectionLabel: string | null;
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
  credentialHint,
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
          v-if="credentialHint"
          :icon="capability.attached ? 'i-lucide-triangle-alert' : 'i-lucide-lock'"
          color="warning"
          variant="subtle"
          :title="$t('__hintCredentialRequired')"
          :description="capability.attached
            ? $t('__descriptionAttachedNeedsCredential')
            : $t('__descriptionLockedRequiresCredential', { agent: agent?.name ?? $t('__labelThisAgent') })"
          :actions="[{ label: credentialHint.text, to: credentialHint.to, color: 'warning', variant: 'soft', size: 'md' }]"
        />

        <section
          v-if="sectionLabel"
          class="flex flex-col gap-3"
        >
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
                {{ $t('__actionCancel') }}
              </UButton>
              <UButton
                size="sm"
                :loading="saving"
                :disabled="!isDirty"
                @click="onSave"
              >
                {{ $t('__actionSave') }}
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
          :title="$t('__titleCapabilityNotFound')"
          :description="$t('__descriptionCapabilityNotFound')"
          :actions="[{ label: $t('__actionBackToAgentSettings'), icon: 'i-lucide-arrow-left', to: `/dashboard/agents/${agentId}/edit` }]"
        />
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
