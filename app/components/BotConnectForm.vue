<script setup lang="ts">
import { z } from 'zod';

interface BotConnectFormValue {
  channelSecret: string;
  channelAccessToken: string;
}

defineProps<{
  formId: string;
}>();

const emit = defineEmits<{
  submit: [value: BotConnectFormValue];
}>();

const schema = z.object({
  channelSecret: z.string().min(1, 'Channel secret is required'),
  channelAccessToken: z.string().min(1, 'Channel access token is required'),
}).strict();

const state = reactive<BotConnectFormValue>({
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
    class="space-y-8"
    @submit="onSubmit"
  >
    <section>
      <h2 class="font-mono text-xs uppercase tracking-wider text-dimmed mb-4">
        channel credentials
      </h2>
      <div class="space-y-4">
        <UFormField
          label="Channel Secret"
          name="channelSecret"
          required
        >
          <UInput
            v-model="state.channelSecret"
            type="password"
            placeholder="••••••••••••••••••••••••••••••••"
            autocomplete="off"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <UFormField
          label="Channel Access Token"
          name="channelAccessToken"
          required
        >
          <UTextarea
            v-model="state.channelAccessToken"
            :rows="4"
            placeholder="paste long-lived channel access token from LINE Developers Console"
            autocomplete="off"
            class="w-full"
            :ui="{ base: 'font-mono break-all' }"
          />
        </UFormField>

        <p class="text-sm text-muted">
          fermi verifies the token by calling LINE's
          <code class="font-mono text-toned">getBotInfo</code>
          on connect. Invalid credentials are rejected.
        </p>
      </div>
    </section>
  </UForm>
</template>
