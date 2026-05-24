<script setup lang="ts">
const toast = useToast();
const connecting = ref(false);

const onSubmit = async (value: { channelSecret: string; channelAccessToken: string }) => {
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
      Connect bot
    </template>

    <div class="p-6 sm:p-8 pb-12 max-w-3xl">
      <BotConnectForm
        form-id="bot-connect-form"
        @submit="onSubmit"
      />
    </div>

    <template #footer>
      <UButton
        type="submit"
        form="bot-connect-form"
        :loading="connecting"
      >
        Connect bot
      </UButton>
    </template>
  </NuxtLayout>
</template>
