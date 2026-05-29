<script setup lang="ts">
import type { AgentCapabilityRow } from '~~/server/utils/capabilities';

const props = defineProps<{
  agentId: string;
}>();

const notify = useNotify();

const { data: rows, pending } = useApiFetch<AgentCapabilityRow[]>(
  () => `/api/agents/${props.agentId}/capabilities`,
);

const pendingIds = ref(new Set<string>());

const CAP_WIDTHS = ['w-24', 'w-32', 'w-20', 'w-28'];
const CAP_DESC_WIDTHS = ['w-48', 'w-40', 'w-52', 'w-44'];

// Toggle is locked when the capability has no live credential to call
// against, coming-soon entries, or providers-backed entries where the
// user hasn't connected any provider. Already-attached rows stay
// togglable so the user can always detach.
const isLocked = (cap: AgentCapabilityRow): boolean => {
  if (cap.attached) return false;
  if (cap.credentialType === 'coming_soon') return true;
  if (cap.credentialType === 'providers') {
    return !cap.providers?.some(p => p.status === 'connected');
  }
  return false;
};

const getLockedHint = (cap: AgentCapabilityRow): { text: string; to?: string } | null => {
  if (!isLocked(cap)) return null;
  if (cap.credentialType === 'coming_soon') {
    return { text: 'Coming soon' };
  }
  return { text: 'Connect', to: `/dashboard/connections/${cap.slug}` };
};

const onToggle = async (cap: AgentCapabilityRow, next: boolean) => {
  if (pendingIds.value.has(cap.id)) return;
  const original = cap.attached;
  cap.attached = next;
  pendingIds.value.add(cap.id);
  try {
    if (next) {
      await $fetch(`/api/agents/${props.agentId}/capabilities`, {
        method: 'POST',
        body:   { capabilityId: cap.id },
      });
      notify.success(`${cap.displayName} attached`);
    } else {
      await $fetch(`/api/agents/${props.agentId}/capabilities/${cap.id}`, {
        method: 'DELETE',
      });
      notify.success(`${cap.displayName} detached`);
    }
  } catch (e) {
    cap.attached = original;
    notify.error(next ? 'Attach failed' : 'Detach failed', e);
  } finally {
    pendingIds.value.delete(cap.id);
  }
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <h2 class="font-semibold">
        Capabilities
      </h2>
      <NuxtLink
        to="/dashboard/connections"
        target="_blank"
        rel="noopener"
        class="text-xs text-toned hover:text-highlighted inline-flex items-center gap-1"
      >
        Manage credentials
        <UIcon
          name="i-lucide-external-link"
          class="size-3"
        />
      </NuxtLink>
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div
        v-if="pending && !rows"
        class="divide-y divide-default overflow-hidden"
        aria-busy="true"
      >
        <div
          v-for="i in 4"
          :key="i"
          class="flex items-center gap-4 p-4"
        >
          <USkeleton class="size-5 shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="h-5 flex items-center">
              <USkeleton
                class="h-3"
                :class="CAP_WIDTHS[(i - 1) % CAP_WIDTHS.length]"
              />
            </div>
            <div class="h-5 flex items-center">
              <USkeleton
                class="h-3 bg-muted/70"
                :class="CAP_DESC_WIDTHS[(i - 1) % CAP_DESC_WIDTHS.length]"
              />
            </div>
          </div>
          <USkeleton class="h-5 w-9 rounded-full shrink-0" />
        </div>
      </div>

      <div
        v-else
        class="divide-y divide-default overflow-hidden"
      >
        <div
          v-for="cap in rows ?? []"
          :key="cap.id"
          class="flex items-center gap-4 p-4"
        >
          <UIcon
            :name="getCapabilityIcon(cap.slug)"
            class="size-5 text-toned shrink-0"
          />

          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">
              {{ cap.displayName }}
            </p>
            <p
              v-if="cap.description"
              class="text-xs text-toned"
            >
              {{ cap.description }}
            </p>
          </div>

          <div class="flex items-center gap-3 shrink-0">
            <UBadge
              v-if="cap.credentialType === 'coming_soon'"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              Coming soon
            </UBadge>
            <NuxtLink
              v-if="getLockedHint(cap)?.to"
              :to="getLockedHint(cap)!.to"
              target="_blank"
              rel="noopener"
              class="text-xs text-toned hover:text-highlighted hidden sm:inline-flex items-center gap-1"
            >
              {{ getLockedHint(cap)!.text }}
              <UIcon
                name="i-lucide-external-link"
                class="size-3"
              />
            </NuxtLink>
            <USwitch
              :model-value="cap.attached"
              :disabled="isLocked(cap) || pendingIds.has(cap.id)"
              @update:model-value="onToggle(cap, $event)"
            />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
