<script setup lang="ts">
type Platform = 'line';

const toast = useToast();
const connecting = ref(false);

const platform = ref<Platform | null>(null);

const platformOptions = [
  { label: 'LINE', value: 'line' },
];

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
    toast.add({ title: 'Bot connected', color: 'success' });
    await navigateTo(`/dashboard/bots/${created.id}`);
  }
  catch (e) {
    toast.add({
      title: 'Connect failed',
      description: e instanceof Error ? e.message : 'Unknown error',
      color: 'error',
    });
  }
  finally {
    connecting.value = false;
  }
};
</script>

<template>
  <NuxtLayout name="dashboard">
    <template #title>
      New bot
    </template>

    <template
      v-if="platform === 'line'"
      #actions
    >
      <UButton
        type="submit"
        form="line-bot-connect-form"
        :loading="connecting"
      >
        Create
      </UButton>
    </template>

    <div class="p-6 sm:p-8 pb-12 max-w-3xl flex flex-col gap-6">
      <UFormField
        label="Platform"
        help="Which messaging service this bot connects to."
      >
        <USelect
          v-model="platform"
          :items="platformOptions"
          placeholder="Pick a platform..."
        />
      </UFormField>

      <LineBotConnectForm
        v-if="platform === 'line'"
        form-id="line-bot-connect-form"
        @submit="onLineSubmit"
      />
    </div>
  </NuxtLayout>
</template>
