<script setup lang="ts">
definePageMeta({ layout: false });

interface BotDetail {
  id: string;
  platform: string;
  externalId: string;
  displayName: string | null;
  avatarUrl: string | null;
  agentId: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  webhookUrl: string;
  agent: { id: string; name: string } | null;
}

const route = useRoute();
const toast = useToast();

const { data: bot, error, refresh, pending } = useLazyFetch<BotDetail>(
  () => `/api/bots/${route.params.id}`,
  { headers: useRequestHeaders(['cookie']) },
);

const saving = ref(false);
const deleting = ref(false);
const deleteDialogOpen = ref(false);
const webhookCopied = ref(false);

const { syncingId, sync: syncFromLine } = useBotAvatar(refresh);
const syncing = computed(() => syncingId.value !== null);

const copyWebhook = async () => {
  if (!bot.value) return;
  await navigator.clipboard.writeText(bot.value.webhookUrl);
  webhookCopied.value = true;
  setTimeout(() => { webhookCopied.value = false; }, 1500);
};

const onSubmit = async (value: { agentId: string | null; disabledAt: string | null }) => {
  saving.value = true;
  try {
    await $fetch(`/api/bots/${route.params.id}`, {
      method: 'PATCH',
      body: value,
    });
    toast.add({ title: 'Bot updated', color: 'success' });
    await navigateTo('/dashboard/bots');
  } catch (e) {
    toast.add({
      title: 'Update failed',
      description: e instanceof Error ? e.message : 'Unknown error',
      color: 'error',
    });
  } finally {
    saving.value = false;
  }
};

const onDelete = async () => {
  deleting.value = true;
  try {
    await $fetch(`/api/bots/${route.params.id}`, { method: 'DELETE' });
    toast.add({ title: 'Bot deleted', color: 'success' });
    await navigateTo('/dashboard/bots');
  } catch (e) {
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
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: 'Bots', to: '/dashboard/bots' },
            { label: bot?.displayName ?? '' },
          ]"
          :loading="!bot"
        />
      </template>

      <template
        v-if="bot"
        #actions
      >
        <UButton
          type="submit"
          form="bot-form"
          :loading="saving"
        >
          Save
        </UButton>
      </template>

      <DashboardDetailSkeleton
        v-if="pending && !bot"
        :fields="2"
      />

      <div
        v-else-if="error"
        class="p-6 sm:p-8 max-w-3xl"
      >
        <div class="border border-dashed border-default rounded-md py-16 px-6 text-center">
          <p class="text-sm text-muted mb-2">
            Bot not found
          </p>
          <p class="text-sm text-dimmed mb-6 max-w-md mx-auto">
            This bot may have been deleted, or the link is wrong.
          </p>
          <UButton
            to="/dashboard/bots"
            icon="i-lucide-arrow-left"
          >
            Back to bots
          </UButton>
        </div>
      </div>

      <div
        v-if="bot"
        class="p-6 sm:p-8 pb-12 max-w-3xl flex flex-col gap-6"
      >
        <div class="flex items-center gap-4">
          <UAvatar
            v-if="bot.avatarUrl"
            :src="bot.avatarUrl"
            size="3xl"
          />
          <UTooltip
            v-else
            text="Sync avatar from LINE"
          >
            <button
              type="button"
              :disabled="syncing"
              class="relative size-12 shrink-0 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors group disabled:opacity-60 cursor-pointer"
              @click.stop.prevent="syncFromLine(bot.id)"
            >
              <UIcon
                v-if="syncing"
                name="i-lucide-loader-circle"
                class="absolute inset-0 m-auto size-5 text-primary animate-spin"
              />
              <template v-else>
                <span class="absolute inset-0 flex items-center justify-center font-mono text-xl font-semibold text-primary transition-opacity group-hover:opacity-0">
                  {{ (bot.displayName ?? '?').charAt(0).toUpperCase() }}
                </span>
                <UIcon
                  name="i-lucide-refresh-cw"
                  class="absolute inset-0 m-auto size-5 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                />
              </template>
            </button>
          </UTooltip>
          <h1 class="text-2xl font-semibold truncate">
            {{ bot.displayName || '(unnamed)' }}
          </h1>
        </div>

        <UFormField
          label="Webhook URL"
          help="Paste this under &quot;Webhook settings&quot; in your LINE channel&apos;s &quot;Messaging API&quot; tab, then turn on &quot;Use webhook&quot;."
        >
          <div class="flex items-center gap-2 p-3 rounded-md border border-muted bg-elevated/40">
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
        </UFormField>

        <BotEditForm
          form-id="bot-form"
          :initial-value="{
            agentId: bot.agentId,
            disabledAt: bot.disabledAt,
          }"
          @submit="onSubmit"
        />

        <UFormField label="Details">
          <div class="p-4 rounded-md border border-muted bg-elevated/40">
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt class="text-muted text-right">
                External ID
              </dt>
              <dd class="text-highlighted break-all">
                {{ bot.externalId }}
              </dd>
              <dt class="text-muted text-right">
                Created
              </dt>
              <dd class="text-highlighted">
                <TimeAgo :date="bot.createdAt" />
              </dd>
              <dt class="text-muted text-right">
                Updated
              </dt>
              <dd class="text-highlighted">
                <TimeAgo :date="bot.updatedAt" />
              </dd>
            </dl>
          </div>
        </UFormField>

        <section>
          <h2 class="text-sm font-medium text-error mb-3">
            Danger zone
          </h2>
          <div class="flex items-center justify-between gap-4 p-4 rounded-md border border-error/40">
            <div class="min-w-0">
              <p class="text-sm font-medium">
                Delete this bot
              </p>
              <p class="text-sm text-muted mt-1">
                Permanent. The saved tokens are removed and any attached agent is unlinked.
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

        <DeleteConfirmDialog
          v-model:open="deleteDialogOpen"
          title="Delete bot"
          :item-name="bot.displayName || bot.externalId"
          confirm-label="Delete"
          :loading="deleting"
          @confirm="onDelete"
        >
          <p>
            Permanently deletes
            <span class="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{{ bot.displayName || bot.externalId }}</span>
            and its saved tokens. Any attached agent is detached but kept.
          </p>
        </DeleteConfirmDialog>
      </div>
    </NuxtLayout>
  </div>
</template>
