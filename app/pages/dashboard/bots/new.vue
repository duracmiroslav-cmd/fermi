<script setup lang="ts">
definePageMeta({ layout: false });

type Platform = 'line';

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
      body: {
        platform: 'line',
        channelSecret: value.channelSecret,
        channelAccessToken: value.channelAccessToken,
      },
    });
    notify.success('Bot connected');
    await navigateTo(`/dashboard/bots/${created.id}`);
  } catch (e) {
    notify.error('Connect failed', e);
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
            { label: 'Bots', to: '/dashboard/bots' },
            { label: 'Connect' },
          ]"
        />
      </template>

      <DashboardContainer>
        <h1 class="text-2xl font-semibold">
          New bot
        </h1>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <p class="font-medium">
                Settings
              </p>
              <div class="flex items-center gap-2">
                <UButton
                  to="/dashboard/bots"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                >
                  Cancel
                </UButton>
                <UButton
                  v-if="platform === 'line'"
                  type="submit"
                  form="line-bot-connect-form"
                  :loading="connecting"
                  size="sm"
                >
                  Connect
                </UButton>
              </div>
            </div>
          </template>

          <div class="flex flex-col gap-6">
            <UFormField
              label="Platform"
              help="Which messaging service this bot connects to."
            >
              <USelect
                v-model="platform"
                :items="platformOptions"
                :icon="selectedPlatformIcon"
                placeholder="Pick a platform..."
              />
            </UFormField>

            <LineBotConnectForm
              v-if="platform === 'line'"
              form-id="line-bot-connect-form"
              @submit="onLineSubmit"
            />
          </div>
        </UCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
