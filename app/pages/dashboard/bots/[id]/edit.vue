<script setup lang="ts">
definePageMeta({ layout: false });

interface BotDetail {
  id:                     string;
  platform:               string;
  externalId:             string;
  displayName:            string | null;
  avatarUrl:              string | null;
  agentId:                string;
  groupActivationCode:    string | null;
  groupTranscribeEnabled: boolean;
  disabledAt:             string | null;
  webhookVerifiedAt:      string | null;
  createdAt:              string;
  updatedAt:              string;
  webhookUrl:             string;
  agent:                  { id: string; name: string };
}

const route = useRoute();
const { update, remove, isSubmitting, isDeleting } = useBots();

const { data: bot, error, pending } = useApiFetch<BotDetail>(
  () => `/api/bots/${route.params.id}`,
);
const { status, isSetupComplete } = useBotStatus(bot);

const deleteDialogOpen = ref(false);

const onSubmit = async (value: { agentId: string; disabledAt: string | null; groupActivationCode: string | null; groupTranscribeEnabled: boolean }) => {
  const id = route.params.id as string;
  if (await update(id, value)) await navigateTo(`/dashboard/bots/${id}`);
};

const onDelete = async () => {
  if (await remove(route.params.id as string)) await navigateTo('/dashboard/bots');
};
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: $t('__labelBot', 2), to: '/dashboard/bots' },
            { label: bot?.displayName ?? '', to: `/dashboard/bots/${route.params.id}` },
            { label: $t('__actionEdit') },
          ]"
          :loading="!bot"
        />
      </template>

      <DashboardDetailSkeleton v-if="pending && !bot" />

      <DashboardContainer v-else-if="error">
        <UEmpty
          variant="subtle"
          icon="i-lucide-search-x"
          :title="$t('__titleBotNotFound')"
          :description="$t('__descriptionBotNotFound')"
          :actions="[{ label: $t('__actionBackToBots'), icon: 'i-lucide-arrow-left', to: '/dashboard/bots' }]"
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
              :aria-label="status ? $t(BOT_STATUS_LABEL_KEY[status]) : $t('__hintLoadingStatus')"
            />
          </div>
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              {{ bot.displayName || $t('__labelUnnamed') }}
            </h1>
            <p class="text-sm text-toned mt-1">
              {{ status ? $t(BOT_STATUS_LABEL_KEY[status]) : '' }}
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold flex items-center gap-2">
              <UIcon
                name="i-lucide-settings"
                class="size-4 text-toned"
              />
              {{ $t('__titleSettings') }}
            </h2>
            <div class="flex items-center gap-2">
              <UButton
                :to="`/dashboard/bots/${bot.id}`"
                color="neutral"
                variant="outline"
                size="sm"
              >
                {{ $t('__actionCancel') }}
              </UButton>
              <UButton
                type="submit"
                form="bot-form"
                :loading="isSubmitting"
                size="sm"
              >
                {{ $t('__actionSave') }}
              </UButton>
            </div>
          </div>
          <UCard>
            <BotEditForm
              form-id="bot-form"
              :initial-value="{
                agentId: bot.agentId,
                disabledAt: bot.disabledAt,
                groupActivationCode: bot.groupActivationCode,
                groupTranscribeEnabled: bot.groupTranscribeEnabled,
              }"
              :is-setup-complete="isSetupComplete"
              @submit="onSubmit"
            />
          </UCard>
        </div>

        <div class="flex flex-col gap-3">
          <h2 class="font-semibold text-error flex items-center gap-2">
            <UIcon
              name="i-lucide-triangle-alert"
              class="size-4"
            />
            {{ $t('__titleDangerZone') }}
          </h2>
          <UCard>
            <div class="grid grid-cols-12 gap-4 md:items-center">
              <div class="col-span-12 md:col-span-9 min-w-0">
                <p class="text-sm font-medium">
                  {{ $t('__titleDeleteBot') }}
                </p>
                <p class="text-xs text-toned mt-1">
                  {{ $t('__descriptionDeleteBot') }}
                </p>
              </div>
              <UButton
                color="error"
                variant="outline"
                size="sm"
                class="col-span-12 md:col-span-3 justify-self-end"
                @click="deleteDialogOpen = true"
              >
                {{ $t('__actionDeleteBot') }}
              </UButton>
            </div>
          </UCard>
        </div>

        <DeleteConfirmDialog
          v-model:open="deleteDialogOpen"
          :title="$t('__titleDeleteBot')"
          :item-name="bot.displayName || bot.externalId"
          :confirm-label="$t('__actionDelete')"
          :loading="isDeleting"
          @confirm="onDelete"
        >
          <I18nT
            keypath="__descriptionDeleteBotConfirm"
            tag="p"
          >
            <template #name>
              <span class="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{{ bot.displayName || bot.externalId }}</span>
            </template>
          </I18nT>
        </DeleteConfirmDialog>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
