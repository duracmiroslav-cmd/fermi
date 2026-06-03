<script setup lang="ts">
interface BuildStep {
  type:    'llm_requested' | 'llm_responded' | 'tool_called' | 'tool_responded';
  payload: Record<string, unknown>;
}

interface BuildResponse {
  text:       string;
  hitStepCap: boolean;
  steps:      BuildStep[];
  changed:    boolean;
}

interface BuilderMessage {
  role:        'user' | 'assistant';
  content:     string;
  changes?:    string[];
  hitStepCap?: boolean;
}

const props = defineProps<{ agentId: string }>();
// Fires when the builder mutated the agent, so the page refetches its
// config (and the test chat picks up the new behavior).
const emit = defineEmits<{ updated: [] }>();

// Config-mutating tools → the chip shown under the builder's reply.
const CHANGE_LABEL_KEY: Record<string, string> = {
  update_agent:     '__labelBuilderUpdatedAgent',
  set_capabilities: '__labelBuilderSetCapabilities',
};

const messages = ref<BuilderMessage[]>([]);
const draft = ref('');
const isSending = ref(false);
const errorKey = ref<string | null>(null);
const listEl = ref<HTMLElement | null>(null);

const canSend = computed(() => draft.value.trim().length > 0 && !isSending.value);

watch(
  () => messages.value.length + (isSending.value ? 1 : 0),
  () => nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
  }),
);

const onSend = async () => {
  if (!canSend.value) return;
  errorKey.value = null;
  messages.value.push({ role: 'user', content: draft.value.trim() });
  draft.value = '';
  isSending.value = true;

  try {
    const res = await $fetch<BuildResponse>(`/api/agents/${props.agentId}/build`, {
      method: 'POST',
      body:   { messages: messages.value.map(m => ({ role: m.role, content: m.content })) },
    });
    const changes = [...new Set(
      res.steps
        .filter(s => s.type === 'tool_called')
        .map(s => CHANGE_LABEL_KEY[String(s.payload.name ?? '')])
        .filter((k): k is string => !!k),
    )];
    messages.value.push({ role: 'assistant', content: res.text, changes, hitStepCap: res.hitStepCap });
    if (res.changed) emit('updated');
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    errorKey.value = status === 429 ? '__errorTestChatRateLimited' : '__errorTestChatFailed';
  } finally {
    isSending.value = false;
  }
};

// Send on Enter, but let the IME keep it: while composing (e.g. picking a
// Chinese candidate) Enter confirms the candidate and must not submit.
const onEnter = (e: KeyboardEvent) => {
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  onSend();
};

const onReset = () => {
  messages.value = [];
  errorKey.value = null;
  draft.value = '';
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <h2 class="font-semibold flex items-center gap-2">
        <UIcon
          name="i-lucide-atom"
          class="size-4 text-toned"
        />
        {{ $t('__titleBuilderChat') }}
      </h2>
      <UButton
        v-if="messages.length"
        icon="i-lucide-rotate-ccw"
        color="neutral"
        variant="soft"
        size="sm"
        @click="onReset"
      >
        {{ $t('__actionResetChat') }}
      </UButton>
    </div>

    <UCard :ui="{ body: 'flex flex-col gap-0 p-0 sm:p-0' }">
      <div
        ref="listEl"
        class="h-80 overflow-y-auto p-4 sm:p-6"
      >
        <div
          v-if="!messages.length && !isSending"
          class="flex flex-col items-center justify-center gap-2 min-h-full text-center"
        >
          <UIcon
            name="i-lucide-atom"
            class="size-8 text-muted"
          />
          <p class="text-sm text-toned max-w-xs">
            {{ $t('__descriptionBuilderChat') }}
          </p>
        </div>

        <ul
          v-else
          class="flex flex-col gap-4"
        >
          <li
            v-for="(message, i) in messages"
            :key="i"
            class="flex flex-col gap-1.5"
            :class="message.role === 'user' ? 'items-end' : 'items-start'"
          >
            <div
              class="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words leading-relaxed"
              :class="message.role === 'user' ? 'bg-primary/10' : 'bg-muted'"
            >
              {{ message.content }}
            </div>

            <div
              v-if="message.changes?.length"
              class="flex flex-wrap gap-1"
            >
              <UBadge
                v-for="(changeKey, ci) in message.changes"
                :key="ci"
                color="primary"
                variant="subtle"
                size="sm"
                icon="i-lucide-check"
              >
                {{ $t(changeKey) }}
              </UBadge>
            </div>

            <p
              v-if="message.hitStepCap"
              class="text-xs text-toned"
            >
              {{ $t('__descriptionTestChatStepCap') }}
            </p>
          </li>

          <li
            v-if="isSending"
            class="flex items-center gap-2 text-toned"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-4 animate-spin"
            />
            <span class="text-sm">{{ $t('__labelTestChatThinking') }}</span>
          </li>
        </ul>
      </div>

      <UAlert
        v-if="errorKey"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="$t(errorKey)"
        class="mx-4 mb-4 sm:mx-6"
      />

      <div class="border-t border-default p-4 sm:px-6">
        <div class="relative">
          <UTextarea
            v-model="draft"
            :rows="1"
            autoresize
            :maxrows="5"
            :placeholder="$t('__placeholderBuilderMessage')"
            class="w-full"
            :ui="{ base: 'pe-10' }"
            @keydown.enter.exact="onEnter"
          />
          <UButton
            icon="i-lucide-send-horizontal"
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="!canSend"
            class="absolute end-2 top-1"
            @click="onSend"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
