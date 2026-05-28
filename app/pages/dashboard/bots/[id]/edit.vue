<script setup lang="ts">
definePageMeta({ layout: false });

interface BotDetail {
  id:                string;
  platform:          string;
  externalId:        string;
  displayName:       string | null;
  avatarUrl:         string | null;
  agentId:           string;
  disabledAt:        string | null;
  webhookVerifiedAt: string | null;
  createdAt:         string;
  updatedAt:         string;
  webhookUrl:        string;
  agent:             { id: string; name: string };
}

const route = useRoute();
const notify = useNotify();

const { data: bot, error, pending } = useApiFetch<BotDetail>(
  () => `/api/bots/${route.params.id}`,
);
const { status, isSetupComplete } = useBotStatus(bot);

const saving = ref(false);
const deleting = ref(false);
const deleteDialogOpen = ref(false);

const onSubmit = async (value: { agentId: string; disabledAt: string | null }) => {
  saving.value = true;
  try {
    await $fetch(`/api/bots/${route.params.id}`, {
      method: 'PATCH',
      body:   value,
    });
    notify.success('Bot updated');
    await refreshNuxtData(route.params.id as string);
    await navigateTo(`/dashboard/bots/${route.params.id}`);
  } catch (e) {
    notify.error('Update failed', e);
  } finally {
    saving.value = false;
  }
};

const onDelete = async () => {
  deleting.value = true;
  try {
    await $fetch(`/api/bots/${route.params.id}`, { method: 'DELETE' });
    notify.success('Bot deleted');
    await navigateTo('/dashboard/bots');
  } catch (e) {
    notify.error('Delete failed', e);
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
            { label: bot?.displayName ?? '', to: `/dashboard/bots/${route.params.id}` },
            { label: 'Edit' },
          ]"
          :loading="!bot"
        />
      </template>

      <DashboardDetailSkeleton
        v-if="pending && !bot"
      />

      <DashboardContainer v-else-if="error">
        <UEmpty
          variant="subtle"
          icon="i-lucide-search-x"
          title="Bot not found"
          description="This bot may have been deleted, or the link is wrong."
          :actions="[{ label: 'Back to bots', icon: 'i-lucide-arrow-left', to: '/dashboard/bots' }]"
        />
      </DashboardContainer>

      <DashboardContainer v-if="bot">
        <div class="flex items-center gap-4">
          <div class="relative shrink-0">
            <UAvatar
              v-if="bot.avatarUrl"
              :src="bot.avatarUrl"
              size="3xl"
            />
            <div
              v-else
              class="size-12 shrink-0 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <span class="font-mono text-xl font-semibold text-primary">
                {{ (bot.displayName ?? '?').charAt(0).toUpperCase() }}
              </span>
            </div>
            <span
              class="absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-default"
              :class="status ? BOT_STATUS_DOT[status] : 'bg-muted animate-pulse'"
              :aria-label="status ? BOT_STATUS_LABEL[status] : 'Loading status'"
            />
          </div>
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              {{ bot.displayName || '(unnamed)' }}
            </h1>
            <p class="text-sm text-toned mt-1">
              {{ status ? BOT_STATUS_LABEL[status] : '' }}
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              Settings
            </h2>
            <div class="flex items-center gap-2">
              <UButton
                :to="`/dashboard/bots/${bot.id}`"
                color="neutral"
                variant="outline"
                size="sm"
              >
                Cancel
              </UButton>
              <UButton
                type="submit"
                form="bot-form"
                :loading="saving"
                size="sm"
              >
                Save
              </UButton>
            </div>
          </div>
          <UCard>
            <BotEditForm
              form-id="bot-form"
              :initial-value="{
                agentId: bot.agentId,
                disabledAt: bot.disabledAt,
              }"
              :is-setup-complete="isSetupComplete"
              @submit="onSubmit"
            />
          </UCard>
        </div>

        <div class="flex flex-col gap-3">
          <h2 class="font-semibold text-error">
            Danger zone
          </h2>
          <UCard>
            <div class="grid grid-cols-12 gap-4 md:items-center">
              <div class="col-span-12 md:col-span-9 min-w-0">
                <p class="text-sm font-medium">
                  Delete this bot
                </p>
                <p class="text-xs text-toned mt-1">
                  Permanent. The saved tokens are removed and any attached agent is unlinked.
                </p>
              </div>
              <UButton
                color="error"
                variant="outline"
                size="sm"
                class="col-span-12 md:col-span-3 justify-self-end"
                @click="deleteDialogOpen = true"
              >
                Delete bot
              </UButton>
            </div>
          </UCard>
        </div>

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
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
