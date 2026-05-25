<script setup lang="ts">
import { z } from 'zod';

interface LineBotConnectFormValue {
  channelSecret: string;
  channelAccessToken: string;
}

defineProps<{
  formId: string;
}>();

const emit = defineEmits<{
  submit: [value: LineBotConnectFormValue];
}>();

const schema = z.object({
  channelSecret: z.string().min(1, 'Channel secret is required'),
  channelAccessToken: z.string().min(1, 'Channel access token is required'),
}).strict();

const state = reactive<LineBotConnectFormValue>({
  channelSecret: '',
  channelAccessToken: '',
});

const onSubmit = () => {
  emit('submit', { ...state });
};
</script>

<template>
  <UForm
    :id="formId"
    :schema="schema"
    :state="state"
    class="flex flex-col gap-6"
    @submit="onSubmit"
  >
    <UFormField
      label="Channel Secret"
      name="channelSecret"
      required
      help="Find this in your LINE channel&apos;s &quot;Basic settings&quot; tab."
    >
      <UInput
        v-model.trim="state.channelSecret"
        icon="i-lucide-key-round"
        type="password"
        autocomplete="off"
      />
    </UFormField>

    <UFormField
      label="Channel Access Token"
      name="channelAccessToken"
      required
      help="Find this in your LINE channel&apos;s &quot;Messaging API&quot; tab."
    >
      <UInput
        v-model.trim="state.channelAccessToken"
        icon="i-lucide-key-round"
        type="password"
        autocomplete="off"
      />
    </UFormField>
  </UForm>
</template>
