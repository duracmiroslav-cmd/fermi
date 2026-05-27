<script setup lang="ts">
definePageMeta({ layout: false });

interface BotDetail {
  id:          string;
  platform:    string;
  externalId:  string;
  displayName: string | null;
  avatarUrl:   string | null;
  agentId:     string;
  disabledAt:  string | null;
  createdAt:   string;
  updatedAt:   string;
  webhookUrl:  string;
  agent:       { id: string; name: string };
}

const route = useRoute();
const notify = useNotify();

const { data: bot, error, pending } = useApiFetch<BotDetail>(
  () => `/api/bots/${route.params.id}`,
);

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

      <template
        v-if="bot"
        #actions
      >
        <UButton
          :to="`/dashboard/bots/${bot.id}`"
          color="neutral"
          variant="ghost"
        >
          Cancel
        </UButton>
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
        <BotEditForm
          form-id="bot-form"
          :initial-value="{
            agentId: bot.agentId,
            disabledAt: bot.disabledAt,
          }"
          @submit="onSubmit"
        />

        <section>
          <h2 class="text-sm font-medium text-error mb-3">
            Danger zone
          </h2>
          <div class="grid grid-cols-12 gap-4 md:items-center p-4 rounded-md border border-error/40">
            <div class="col-span-12 md:col-span-9 min-w-0">
              <p class="text-sm font-medium">
                Delete this bot
              </p>
              <p class="text-sm text-toned mt-1">
                Permanent. The saved tokens are removed and any attached agent is unlinked.
              </p>
            </div>
            <UButton
              color="error"
              variant="outline"
              class="col-span-12 md:col-span-3 justify-self-end"
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
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
