<script setup lang="ts">
definePageMeta({ layout: false });

type Platform = 'line';

const { t } = useI18n();
const notify = useNotify();
const connecting = ref(false);

const platformOptions: Array<{ label: string; value: Platform; icon: string }> = [
  { label: 'LINE', value: 'line', icon: 'i-simple-icons-line' },
];

const platform = ref<Platform>(platformOptions[0]!.value);
const selectedPlatformIcon = computed(
  () => platformOptions.find(o => o.value === platform.value)?.icon,
);

const onLineSubmit = async (value: { channelSecret: string; channelAccessToken: string }) => {
  connecting.value = true;
  try {
    const created = await $fetch<{ id: string }>('/api/bots', {
      method: 'POST',
      body:   {
        platform:           'line',
        channelSecret:      value.channelSecret,
        channelAccessToken: value.channelAccessToken,
      },
    });
    notify.success(t('__toastBotConnected'));
    await navigateTo(`/dashboard/bots/${created.id}`);
  } catch (e) {
    notify.error(t('__toastConnectFailed'), e);
  } finally {
    connecting.value = false;
  }
};
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: $t('__labelBot', 2), to: '/dashboard/bots' },
            { label: $t('__actionConnect') },
          ]"
        />
      </template>

      <DashboardContainer>
        <h1 class="text-2xl font-semibold">
          {{ $t('__titleNewBot') }}
        </h1>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              {{ $t('__titleSettings') }}
            </h2>
            <div class="flex items-center gap-2">
              <UButton
                to="/dashboard/bots"
                color="neutral"
                variant="outline"
                size="sm"
              >
                {{ $t('__actionCancel') }}
              </UButton>
              <UButton
                v-if="platform === 'line'"
                type="submit"
                form="line-bot-connect-form"
                :loading="connecting"
                size="sm"
              >
                {{ $t('__actionConnect') }}
              </UButton>
            </div>
          </div>

          <UCard>
            <div class="flex flex-col gap-6">
              <UFormField
                :label="$t('__labelPlatform')"
                :help="$t('__hintPlatform')"
              >
                <USelect
                  v-model="platform"
                  :items="platformOptions"
                  :icon="selectedPlatformIcon"
                  :placeholder="$t('__placeholderPlatform')"
                />
              </UFormField>

              <LineBotConnectForm
                v-if="platform === 'line'"
                form-id="line-bot-connect-form"
                @submit="onLineSubmit"
              />
            </div>
          </UCard>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
