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

const iconBySlug: Record<string, string> = {
  'time': 'i-lucide-clock',
  'web-search': 'i-lucide-search',
  'web-fetch': 'i-lucide-globe',
  'github': 'i-simple-icons-github',
  'google-calendar': 'i-simple-icons-googlecalendar',
  'notion': 'i-simple-icons-notion',
};
const iconFor = (slug: string) => iconBySlug[slug] ?? 'i-lucide-puzzle';

// Toggle is locked when the capability has no live credential to call
// against — coming-soon entries, or providers-backed entries where the
// user hasn't connected any provider. Already-attached rows stay
// togglable so the user can always detach.
const isLocked = (cap: AgentCapabilityRow): boolean => {
  if (cap.attached) return false;
  if (cap.credentialKind === 'coming_soon') return true;
  if (cap.credentialKind === 'providers') {
    return !cap.providers?.some(p => p.status === 'connected');
  }
  return false;
};

const lockedHint = (cap: AgentCapabilityRow): { text: string; to?: string } | null => {
  if (!isLocked(cap)) return null;
  if (cap.credentialKind === 'coming_soon') {
    return { text: 'Coming soon' };
  }
  return { text: 'Connect on Connections', to: '/dashboard/connections' };
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
        body: { capabilityId: cap.id },
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
  <UFormField label="Capabilities">
    <template #hint>
      <UButton
        size="xs"
        color="neutral"
        variant="link"
        trailing-icon="i-lucide-arrow-up-right"
        to="/dashboard/connections"
      >
        Manage credentials
      </UButton>
    </template>

    <DashboardCardSkeleton v-if="pending && !rows" />

    <div
      v-else
      class="rounded-md ring ring-inset ring-muted bg-elevated/50 divide-y divide-default"
    >
      <div
        v-for="cap in rows ?? []"
        :key="cap.id"
        class="flex items-center gap-4 p-4"
      >
        <UIcon
          :name="iconFor(cap.slug)"
          class="size-5 text-toned shrink-0"
        />

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <p class="text-sm font-medium truncate">
              {{ cap.displayName }}
            </p>
            <UBadge
              v-if="cap.credentialKind === 'coming_soon'"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              Coming soon
            </UBadge>
          </div>
          <p
            v-if="cap.description"
            class="text-sm text-toned truncate"
          >
            {{ cap.description }}
          </p>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <NuxtLink
            v-if="lockedHint(cap)?.to"
            :to="lockedHint(cap)!.to"
            class="text-xs text-toned hover:text-highlighted hidden sm:inline-flex items-center gap-1"
          >
            {{ lockedHint(cap)!.text }}
            <UIcon
              name="i-lucide-arrow-up-right"
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
  </UFormField>
</template>
