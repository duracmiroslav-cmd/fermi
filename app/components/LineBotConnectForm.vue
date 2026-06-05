<script setup lang="ts">
import { z } from 'zod';

interface LineBotConnectFormValue {
  channelSecret:      string;
  channelAccessToken: string;
}

withDefaults(defineProps<{
  formId:          string;
  // The intro line differs by context (connect vs update credentials).
  descriptionKey?: string;
}>(), { descriptionKey: '__descriptionLineConnect' });

const emit = defineEmits<{
  submit: [value: LineBotConnectFormValue];
}>();

const { t } = useI18n();

const schema = z.object({
  channelSecret:      z.string().min(1, t('__errorChannelSecretRequired')),
  channelAccessToken: z.string().min(1, t('__errorChannelAccessTokenRequired')),
}).strict();

const state = reactive<LineBotConnectFormValue>({
  channelSecret:      '',
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
    <p class="text-sm text-toned">
      {{ $t(descriptionKey) }}
    </p>

    <UFormField
      :label="$t('__labelChannelSecret')"
      name="channelSecret"
      required
      :help="$t('__hintChannelSecret')"
    >
      <UInput
        v-model.trim="state.channelSecret"
        icon="i-lucide-key-round"
        type="password"
        autocomplete="off"
      />
    </UFormField>

    <UFormField
      :label="$t('__labelChannelAccessToken')"
      name="channelAccessToken"
      required
      :help="$t('__hintChannelAccessToken')"
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
