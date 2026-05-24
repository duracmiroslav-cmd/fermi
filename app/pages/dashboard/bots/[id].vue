<script setup lang="ts">
interface BotDetail {
  id: string;
  platform: string;
  externalId: string;
  displayName: string | null;
  agentId: string | null;
  enabled: boolean;
  allowGroups: boolean;
  createdAt: string;
  updatedAt: string;
  webhookUrl: string;
  agent: { id: string; name: string } | null;
}

const route = useRoute();
const toast = useToast();

const { data: bot, error } = await useFetch<BotDetail>(
  () => `/api/bots/${route.params.id}`,
  { headers: useRequestHeaders(['cookie']) },
);

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Bot not found' });
}

const saving = ref(false);
const deleting = ref(false);
const deleteDialogOpen = ref(false);
const webhookCopied = ref(false);

const copyWebhook = async () => {
  if (!bot.value) return;
  await navigator.clipboard.writeText(bot.value.webhookUrl);
  webhookCopied.value = true;
  setTimeout(() => { webhookCopied.value = false; }, 1500);
};

const onSubmit = async (value: { displayName: string; agentId: string | null; enabled: boolean; allowGroups: boolean }) => {
  saving.value = true;
  try {
    await $fetch(`/api/bots/${route.params.id}`, {
      method: 'PATCH',
      body: value,
    });
    toast.add({ title: 'Bot updated', color: 'success' });
    await navigateTo('/dashboard/bots');
  }
  catch (e) {
    toast.add({
      title: 'Update failed',
      description: e instanceof Error ? e.message : 'Unknown error',
      color: 'error',
    });
  }
  finally {
    saving.value = false;
  }
};

const onDelete = async () => {
  deleting.value = true;
  try {
    await $fetch(`/api/bots/${route.params.id}`, { method: 'DELETE' });
    toast.add({ title: 'Bot deleted', color: 'success' });
    await navigateTo('/dashboard/bots');
  }
  catch (e) {
    toast.add({
      title: 'Delete failed',
      description: e instanceof Error ? e.message : 'Unknown error',
      color: 'error',
    });
    deleting.value = false;
  }
};
</script>

<template>
  <NuxtLayout name="dashboard">
    <template #title>
      {{ bot?.displayName || 'Bot' }}
    </template>

    <div
      v-if="bot"
      class="p-6 sm:p-8 pb-12 max-w-3xl space-y-12"
    >
      <p class="font-mono text-xs text-muted -mt-2">
        <template v-if="bot.agent">
          Using
          <NuxtLink
            :to="`/dashboard/agents/${bot.agent.id}`"
            class="text-highlighted hover:underline"
          >
            {{ bot.agent.name }}
          </NuxtLink>
          <span
            aria-hidden="true"
            class="ml-1"
          >↗</span>
        </template>
        <template v-else>
          No agent attached ·
          <NuxtLink
            to="/dashboard/agents"
            class="text-toned hover:text-highlighted hover:underline"
          >
            attach one →
          </NuxtLink>
        </template>
      </p>

      <section>
        <h2 class="font-mono text-xs uppercase tracking-wider text-dimmed mb-3">
          webhook url
        </h2>
        <div class="flex items-center gap-2 p-3 rounded-md border border-default bg-elevated/40">
          <code class="flex-1 font-mono text-sm text-highlighted truncate select-all">
            {{ bot.webhookUrl }}
          </code>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :icon="webhookCopied ? 'i-lucide-check' : 'i-lucide-copy'"
            :aria-label="webhookCopied ? 'Copied' : 'Copy webhook URL'"
            @click="copyWebhook"
          />
        </div>
        <p class="text-sm text-muted mt-2">
          Paste into LINE Developers Console → Messaging API → Webhook URL, then enable "Use webhook".
        </p>
      </section>

      <BotEditForm
        form-id="bot-form"
        :initial-value="{
          displayName: bot.displayName ?? '',
          agentId: bot.agentId,
          enabled: bot.enabled,
          allowGroups: bot.allowGroups,
        }"
        @submit="onSubmit"
      />

      <section>
        <h2 class="font-mono text-xs uppercase tracking-wider text-error mb-3">
          danger zone
        </h2>
        <div class="flex items-center justify-between gap-4 p-4 rounded-md border border-error/40">
          <div class="min-w-0">
            <p class="font-medium">
              Delete this bot
            </p>
            <p class="text-sm text-muted mt-1">
              Permanent. Encrypted credentials are dropped. Agent (if any) unlinked.
            </p>
          </div>
          <UButton
            color="error"
            variant="outline"
            @click="deleteDialogOpen = true"
          >
            Delete bot
          </UButton>
        </div>
      </section>

      <p class="font-mono text-xs text-dimmed">
        external_id: {{ bot.externalId }} · created {{ relativeTime(bot.createdAt) }} · updated {{ relativeTime(bot.updatedAt) }}
      </p>

      <DeleteConfirmDialog
        v-model:open="deleteDialogOpen"
        title="Delete bot"
        :item-name="bot.displayName || bot.externalId"
        confirm-label="Delete bot"
        :loading="deleting"
        @confirm="onDelete"
      >
        <p>
          This permanently deletes
          <span class="font-mono text-highlighted">{{ bot.displayName || bot.externalId }}</span>
          and its encrypted credentials. The agent bound to it (if any) is unlinked but kept.
        </p>
      </DeleteConfirmDialog>
    </div>

    <template
      v-if="bot"
      #footer
    >
      <UButton
        type="submit"
        form="bot-form"
        :loading="saving"
      >
        Save changes
      </UButton>
    </template>
  </NuxtLayout>
</template>
