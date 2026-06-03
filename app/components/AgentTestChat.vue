<script setup lang="ts">
interface ToolStep {
  type:    'llm_requested' | 'llm_responded' | 'tool_called' | 'tool_responded';
  payload: Record<string, unknown>;
}

interface InvokeResponse {
  text:       string;
  hitStepCap: boolean;
  steps:      ToolStep[];
}

// `tools` lists the tools the agent called producing this reply, in
// order, for the subtle "used X" chips under the bubble.
interface ChatMessage {
  role:        'user' | 'assistant';
  content:     string;
  tools?:      string[];
  hitStepCap?: boolean;
}

const props = defineProps<{ agentId: string }>();

// Tool names reaching the LLM are namespaced `slug__name` for MCP
// capabilities; the prefix is plumbing, so chips show just the verb.
const toolLabel = (name: string): string => name.replace(/^.*__/, '');

const messages = ref<ChatMessage[]>([]);
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
    const res = await $fetch<InvokeResponse>(`/api/agents/${props.agentId}/invoke`, {
      method: 'POST',
      body:   { messages: messages.value.map(m => ({ role: m.role, content: m.content })) },
    });
    messages.value.push({
      role:       'assistant',
      content:    res.text,
      tools:      res.steps.filter(s => s.type === 'tool_called').map(s => toolLabel(String(s.payload.name ?? ''))),
      hitStepCap: res.hitStepCap,
    });
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
      <h2 class="font-semibold">
        {{ $t('__titleTestChat') }}
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
      <!-- Conversation -->
      <div
        ref="listEl"
        class="max-h-96 overflow-y-auto p-4 sm:p-6"
      >
        <!-- Empty state -->
        <div
          v-if="!messages.length && !isSending"
          class="flex flex-col items-center gap-2 py-8 text-center"
        >
          <UIcon
            name="i-lucide-message-circle-dashed"
            class="size-8 text-muted"
          />
          <p class="text-sm text-toned max-w-xs">
            {{ $t('__descriptionTestChat') }}
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

            <!-- Tools this turn called -->
            <div
              v-if="message.tools?.length"
              class="flex flex-wrap gap-1"
            >
              <UBadge
                v-for="(tool, ti) in message.tools"
                :key="ti"
                color="neutral"
                variant="subtle"
                size="sm"
                icon="i-lucide-wrench"
                class="font-mono"
              >
                {{ $t('__labelToolUsed', { tool }) }}
              </UBadge>
            </div>

            <!-- Stopped without converging -->
            <p
              v-if="message.hitStepCap"
              class="text-xs text-toned"
            >
              {{ $t('__descriptionTestChatStepCap') }}
            </p>
          </li>

          <!-- In-flight -->
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

      <!-- Error -->
      <UAlert
        v-if="errorKey"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="$t(errorKey)"
        class="mx-4 mb-4 sm:mx-6"
      />

      <!-- Composer -->
      <div class="border-t border-default p-4 sm:px-6">
        <div class="relative">
          <UTextarea
            v-model="draft"
            :rows="1"
            autoresize
            :maxrows="5"
            :placeholder="$t('__placeholderTestMessage')"
            :disabled="isSending"
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
            :loading="isSending"
            class="absolute end-2 top-1"
            @click="onSend"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
