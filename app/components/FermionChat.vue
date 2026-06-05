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
  // Account onboarding: fermion summoned a connect UI under this reply —
  // a secure LINE form, or an "open OpenRouter sign-in" button.
  // `widgetDone` flips once connected.
  widget?:     'line_connect' | 'openrouter_connect';
  widgetDone?: boolean;
}

const props = defineProps<{
  targetType: 'account' | 'agent' | 'bot';
  // Resource targets (agent / bot) pass an id; account binds to the user.
  targetId?:  string;
  // The dashboard home renders fermion full-height rather than as a panel.
  home?:      boolean;
}>();
// Fires when fermion mutated the resource (or a bot was connected), so the
// host page refetches.
const emit = defineEmits<{ updated: [] }>();

const { t } = useI18n();
const { create, isSubmitting } = useBots();

// Config-mutating tools → the chip shown under fermion's reply.
const CHANGE_LABEL_KEY: Record<string, string> = {
  update_agent:     '__labelBuilderUpdatedAgent',
  set_capabilities: '__labelBuilderSetCapabilities',
  update_bot:       '__labelBuilderUpdatedBot',
};

// Seed prompts offered in the account home's empty state.
const ACCOUNT_SEEDS = ['__seedFermionStart', '__seedFermionConnectBot'];

const messages = ref<BuilderMessage[]>([]);
const draft = ref('');
const isSending = ref(false);
const errorKey = ref<string | null>(null);
const listEl = ref<HTMLElement | null>(null);
// Which message's OpenRouter widget is awaiting the OAuth tab, or null.
const openrouterWaitingIndex = ref<number | null>(null);

// Empty-state copy differs by what fermion is configuring here.
const descriptionKey = computed(() => {
  if (props.targetType === 'account') return '__descriptionFermionAccountChat';
  if (props.targetType === 'bot') return '__descriptionFermionBotChat';
  return '__descriptionBuilderChat';
});

const canSend = computed(() => draft.value.trim().length > 0 && !isSending.value);

// Non-persistent across sessions, but survives in-app navigation + reload
// within the tab so the conversation doesn't evaporate when you click away.
const storageKey = `fermion-chat:${props.targetType}:${props.targetId ?? 'me'}`;

watch(
  () => messages.value.length + (isSending.value ? 1 : 0),
  () => nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
  }),
);

watch(messages, (v) => {
  if (import.meta.client) sessionStorage.setItem(storageKey, JSON.stringify(v));
}, { deep: true });

const onSend = async (override?: string) => {
  const text = (override ?? draft.value).trim();
  if (!text || isSending.value) return;
  errorKey.value = null;
  messages.value.push({ role: 'user', content: text });
  if (override === undefined) draft.value = '';
  isSending.value = true;

  try {
    const res = await $fetch<BuildResponse>('/api/fermion', {
      method: 'POST',
      body:   {
        targetType: props.targetType,
        ...(props.targetId ? { targetId: props.targetId } : {}),
        messages:   messages.value.map(m => ({ role: m.role, content: m.content })),
      },
    });
    const changes = [...new Set(
      res.steps
        .filter(s => s.type === 'tool_called')
        .map(s => CHANGE_LABEL_KEY[String(s.payload.name ?? '')])
        .filter((k): k is string => !!k),
    )];
    // On the account home, a start_*_connect call summons a connect UI
    // under this reply (credentials / OAuth never flow through the chat).
    const connectTool = props.targetType === 'account'
      ? res.steps.find(s => s.type === 'tool_called'
        && (s.payload.name === 'start_line_connect' || s.payload.name === 'start_openrouter_connect'))
      : undefined;
    const widget = connectTool?.payload.name === 'start_openrouter_connect'
      ? 'openrouter_connect' as const
      : connectTool?.payload.name === 'start_line_connect'
        ? 'line_connect' as const
        : undefined;
    messages.value.push({
      role:       'assistant',
      content:    res.text,
      changes,
      hitStepCap: res.hitStepCap,
      widget,
    });
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

const onConnect = async (index: number, value: { channelSecret: string; channelAccessToken: string }) => {
  const created = await create({ platform: 'line', ...value });
  if (!created) return;
  const message = messages.value[index];
  if (message) message.widgetDone = true;
  emit('updated');
  // Let fermion pick up the freshly connected bot (resolved server-side
  // each turn) and carry the conversation to the next step.
  await onSend(t('__fermionConnectedBotMessage'));
};

// OpenRouter is OAuth, not an in-page form: open sign-in in a new tab and
// poll the status endpoint (the tab has no callback to this one), then let
// fermion continue once connected. Mirrors the bot detail page's poll.
const { pause: pauseOpenrouterPoll, resume: resumeOpenrouterPoll } = useIntervalFn(async () => {
  const index = openrouterWaitingIndex.value;
  if (index === null) return;
  const { connected } = await $fetch<{ connected: boolean }>('/api/oauth/openrouter');
  if (!connected) return;
  pauseOpenrouterPoll();
  openrouterWaitingIndex.value = null;
  const message = messages.value[index];
  if (message) message.widgetDone = true;
  emit('updated');
  await onSend(t('__fermionConnectedOpenrouterMessage'));
}, 3500, { immediate: false });

const onConnectOpenrouter = (index: number) => {
  window.open('/api/oauth/openrouter/start', '_blank', 'noopener');
  openrouterWaitingIndex.value = index;
  resumeOpenrouterPoll();
};

const onReset = () => {
  messages.value = [];
  errorKey.value = null;
  draft.value = '';
};

onMounted(() => {
  const saved = sessionStorage.getItem(storageKey);
  if (!saved) return;
  try {
    messages.value = JSON.parse(saved) as BuilderMessage[];
  } catch {
    sessionStorage.removeItem(storageKey);
  }
});
</script>

<template>
  <div :class="['flex flex-col gap-3', home && 'h-full']">
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

    <UCard
      :class="home && 'flex-1 min-h-0'"
      :ui="{ root: home ? 'flex flex-col' : '', body: 'flex flex-col gap-0 p-0 sm:p-0 min-h-0 flex-1' }"
    >
      <div
        ref="listEl"
        :class="['overflow-y-auto p-4 sm:p-6', home ? 'flex-1 min-h-0' : 'h-80']"
      >
        <div
          v-if="!messages.length && !isSending"
          class="flex flex-col items-center justify-center gap-3 min-h-full text-center"
        >
          <UIcon
            name="i-lucide-atom"
            class="size-8 text-muted"
          />
          <p class="text-sm text-toned max-w-xs">
            {{ $t(descriptionKey) }}
          </p>
          <div
            v-if="targetType === 'account'"
            class="flex flex-wrap justify-center gap-2"
          >
            <UButton
              v-for="seed in ACCOUNT_SEEDS"
              :key="seed"
              color="neutral"
              variant="soft"
              size="sm"
              @click="onSend($t(seed))"
            >
              {{ $t(seed) }}
            </UButton>
          </div>
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

            <UCard
              v-if="message.widget === 'line_connect' && !message.widgetDone"
              class="w-full max-w-md"
            >
              <LineBotConnectForm
                :form-id="`fermion-connect-${i}`"
                @submit="(value) => onConnect(i, value)"
              />
              <div class="mt-4 flex justify-end">
                <UButton
                  type="submit"
                  :form="`fermion-connect-${i}`"
                  :loading="isSubmitting"
                  size="sm"
                >
                  {{ $t('__actionConnect') }}
                </UButton>
              </div>
            </UCard>

            <UBadge
              v-else-if="message.widget === 'line_connect' && message.widgetDone"
              color="primary"
              variant="subtle"
              size="sm"
              icon="i-lucide-check"
            >
              {{ $t('__labelFermionBotConnected') }}
            </UBadge>

            <div
              v-if="message.widget === 'openrouter_connect' && !message.widgetDone"
              class="flex flex-col gap-2"
            >
              <UButton
                icon="i-simple-icons-openrouter"
                size="sm"
                class="self-start"
                :disabled="openrouterWaitingIndex === i"
                @click="onConnectOpenrouter(i)"
              >
                {{ $t('__actionConnectOpenrouter') }}
              </UButton>
              <p
                v-if="openrouterWaitingIndex === i"
                class="flex items-center gap-1.5 text-xs text-toned"
              >
                <UIcon
                  name="i-lucide-loader-circle"
                  class="size-3.5 animate-spin"
                />
                {{ $t('__hintFermionWaitingOpenrouter') }}
              </p>
            </div>

            <UBadge
              v-else-if="message.widget === 'openrouter_connect' && message.widgetDone"
              color="primary"
              variant="subtle"
              size="sm"
              icon="i-lucide-check"
            >
              {{ $t('__labelFermionOpenrouterConnected') }}
            </UBadge>

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
            @click="onSend()"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
