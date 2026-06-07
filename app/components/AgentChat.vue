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

type Widget = 'line_connect' | 'openrouter_connect' | 'setup_webhook' | 'bot_test';

interface ChatMessage {
  role:         'user' | 'assistant';
  content:      string;
  changes?:     string[];
  // Capability tools the agent called this turn (e.g. web-search), shown as
  // subtle "used X" chips. Management / mode / debug tools are excluded —
  // their effect surfaces as `changes` chips or widgets instead.
  tools?:       string[];
  hitStepCap?:  boolean;
  // The agent summoned a connect/setup UI under this reply (credentials /
  // OAuth never flow through the chat). `widgetDone` flips once finished.
  widget?:      Widget;
  widgetBotId?: string;
  widgetDone?:  boolean;
}

const props = defineProps<{ agentId: string }>();
// Fires when the agent mutated a resource (or connected something) in
// maintenance mode, so the host page refetches.
const emit = defineEmits<{ updated: [] }>();

const { t } = useI18n();
const notify = useNotify();
const { create, isSubmitting } = useBots();

// Config-mutating management tools → the chip shown under the reply.
const CHANGE_LABEL_KEY: Record<string, string> = {
  update_agent:     '__labelBuilderUpdatedAgent',
  set_capabilities: '__labelBuilderSetCapabilities',
  update_bot:       '__labelBuilderUpdatedBot',
};

// tool name → the widget rendered under the reply.
const WIDGET_BY_TOOL: Record<string, Widget> = {
  start_line_connect:       'line_connect',
  start_openrouter_connect: 'openrouter_connect',
  setup_webhook:            'setup_webhook',
  start_bot_test:           'bot_test',
};

// Management / mode / debug tools surface as `changes` chips or widgets, not
// as "used X" capability chips — exclude them so the chips show only the
// agent's real capability calls (web-search, image-gen, …).
const MANAGEMENT_TOOLS = new Set([
  'switch_mode',
  'update_agent', 'set_capabilities', 'update_bot',
  'list_agents', 'get_agent', 'list_bots', 'get_bot', 'list_models',
  'start_line_connect', 'start_openrouter_connect', 'setup_webhook', 'start_bot_test',
  'list_recent_runs', 'get_run', 'get_last_failure',
]);

// MCP capability tools reach the LLM namespaced `slug__name`; the prefix is
// plumbing, so the chip shows just the verb.
const toolLabel = (name: string): string => name.replace(/^.*__/, '');

// Seed prompts offered in the empty state — config shortcuts for this agent.
const SEEDS = ['__seedFermionAgentPersona', '__seedFermionAgentVoice', '__seedFermionAgentModel'];

const messages = ref<ChatMessage[]>([]);
const draft = ref('');
const isSending = ref(false);
const errorKey = ref<string | null>(null);
const listEl = ref<HTMLElement | null>(null);
// Which message's OpenRouter widget is awaiting the OAuth tab, or null.
const openrouterWaitingIndex = ref<number | null>(null);
// Which message's webhook setup is in flight, or null.
const webhookSettingUpIndex = ref<number | null>(null);

const canSend = computed(() => draft.value.trim().length > 0 && !isSending.value);

// One conversation per agent, in sessionStorage so it survives in-app nav +
// reload (no DB). Navigating to another agent's page swaps the thread.
const storageKey = computed(() => `agent-chat:${props.agentId}`);

const loadStored = (): ChatMessage[] => {
  if (!import.meta.client) return [];
  const saved = sessionStorage.getItem(storageKey.value);
  if (!saved) return [];
  try {
    return JSON.parse(saved) as ChatMessage[];
  } catch {
    return [];
  }
};

watch(
  () => messages.value.length + (isSending.value ? 1 : 0),
  () => nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
  }),
);

watch(messages, (v) => {
  if (import.meta.client) sessionStorage.setItem(storageKey.value, JSON.stringify(v));
}, { deep: true });

// Load this agent's stored conversation whenever the target changes (in-app
// nav between agent pages); the initial load is in onMounted to stay client-only.
watch(() => props.agentId, () => {
  errorKey.value = null;
  draft.value = '';
  messages.value = loadStored();
});

const onSend = async (override?: string) => {
  const text = (override ?? draft.value).trim();
  if (!text || isSending.value) return;
  errorKey.value = null;
  messages.value.push({ role: 'user', content: text });
  if (override === undefined) draft.value = '';
  isSending.value = true;

  try {
    const res = await $fetch<BuildResponse>(`/api/agents/${props.agentId}/invoke`, {
      method: 'POST',
      body:   {
        // A widget-only reply has empty content (kept locally to render the
        // widget); drop it from the request so it doesn't trip the API's
        // non-empty content rule.
        messages: messages.value
          .map(m => ({ role: m.role, content: m.content }))
          .filter(m => m.content.trim().length > 0),
      },
    });
    const changes = [...new Set(
      res.steps
        .filter(s => s.type === 'tool_called')
        .map(s => CHANGE_LABEL_KEY[String(s.payload.name ?? '')])
        .filter((k): k is string => !!k),
    )];
    const tools = [...new Set(
      res.steps
        .filter(s => s.type === 'tool_called')
        .map(s => String(s.payload.name ?? ''))
        .filter(n => n && !MANAGEMENT_TOOLS.has(n))
        .map(toolLabel),
    )];
    const widgetCall = res.steps.find(
      s => s.type === 'tool_called' && WIDGET_BY_TOOL[String(s.payload.name ?? '')],
    );
    const widget = widgetCall ? WIDGET_BY_TOOL[String(widgetCall.payload.name)] : undefined;
    let widgetBotId: string | undefined;
    if (widget === 'setup_webhook' || widget === 'bot_test') {
      try {
        widgetBotId = (JSON.parse(String(widgetCall!.payload.arguments)) as { bot_id?: string }).bot_id;
      } catch { widgetBotId = undefined; }
    }
    messages.value.push({
      role:       'assistant',
      content:    res.text,
      changes,
      tools,
      hitStepCap: res.hitStepCap,
      widget,
      widgetBotId,
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
  // The agent re-resolves account state each turn, so the freshly connected
  // bot is visible and it carries on to the next step.
  await onSend(t('__fermionConnectedBotMessage'));
};

// OpenRouter is OAuth, not an in-page form: open sign-in in a new tab and
// poll the status endpoint (the tab has no callback to this one).
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

// fermi sets + verifies the webhook on LINE via the Messaging API; the
// owner never touches the LINE console. Reuses the bot setup endpoints.
const onSetupWebhook = async (index: number, botId: string) => {
  webhookSettingUpIndex.value = index;
  try {
    await $fetch(`/api/bots/${botId}/webhook/endpoint`, { method: 'PUT' });
    const result = await $fetch<{ success: boolean; detail?: string; reason?: string }>(
      `/api/bots/${botId}/webhook/test`, { method: 'POST' },
    );
    if (!result.success) {
      notify.error(t('__toastWebhookTestFailed'), new Error(result.detail ?? result.reason ?? t('__errorUnknown')));
      return;
    }
    const message = messages.value[index];
    if (message) message.widgetDone = true;
    emit('updated');
    await onSend(t('__fermionWebhookConnectedMessage'));
  } catch (e) {
    notify.error(t('__toastWebhookSetupFailed'), e);
  } finally {
    webhookSettingUpIndex.value = null;
  }
};

const onBotReplied = async (index: number) => {
  const message = messages.value[index];
  if (!message || message.widgetDone) return;
  message.widgetDone = true;
  emit('updated');
  await onSend(t('__fermionBotRepliedMessage'));
};

const onReset = () => {
  messages.value = [];
  errorKey.value = null;
  draft.value = '';
};

onMounted(() => {
  messages.value = loadStored();
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <h2 class="font-semibold flex items-center gap-2">
        <UIcon
          name="i-lucide-messages-square"
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
          class="flex flex-col items-center justify-center gap-3 min-h-full text-center"
        >
          <UIcon
            name="i-lucide-messages-square"
            class="size-8 text-muted"
          />
          <p class="text-sm text-toned max-w-xs">
            {{ $t('__descriptionFermionAccountChat') }}
          </p>
          <div class="flex flex-wrap justify-center gap-2">
            <UButton
              v-for="seed in SEEDS"
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
              v-if="message.content"
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

            <div
              v-if="message.tools?.length"
              class="flex flex-wrap gap-1"
            >
              <UBadge
                v-for="(tool, ti) in message.tools"
                :key="ti"
                color="primary"
                variant="subtle"
                size="sm"
                icon="i-lucide-wrench"
                class="font-mono"
              >
                {{ $t('__labelToolUsed', { tool }) }}
              </UBadge>
            </div>

            <UCard
              v-if="message.widget === 'line_connect' && !message.widgetDone"
              class="w-full max-w-md"
            >
              <LineBotConnectForm
                :form-id="`agent-connect-${i}`"
                @submit="(value) => onConnect(i, value)"
              />
              <div class="mt-4 flex justify-end">
                <UButton
                  type="submit"
                  :form="`agent-connect-${i}`"
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

            <UCard
              v-if="message.widget === 'openrouter_connect' && !message.widgetDone"
              class="w-full max-w-md"
            >
              <div class="flex flex-col gap-3">
                <p class="text-sm text-toned">
                  {{ $t('__descriptionFermionOpenrouterConnect') }}
                </p>
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
            </UCard>

            <UBadge
              v-else-if="message.widget === 'openrouter_connect' && message.widgetDone"
              color="primary"
              variant="subtle"
              size="sm"
              icon="i-lucide-check"
            >
              {{ $t('__labelFermionOpenrouterConnected') }}
            </UBadge>

            <UCard
              v-if="message.widget === 'setup_webhook' && !message.widgetDone && message.widgetBotId"
              class="w-full max-w-md"
            >
              <div class="flex flex-col gap-3">
                <p class="text-sm text-toned">
                  {{ $t('__descriptionWebhookSetup') }}
                </p>
                <UButton
                  icon="i-lucide-link"
                  size="sm"
                  class="self-start"
                  :loading="webhookSettingUpIndex === i"
                  @click="onSetupWebhook(i, message.widgetBotId)"
                >
                  {{ $t('__actionSetupWebhook') }}
                </UButton>
              </div>
            </UCard>

            <UBadge
              v-else-if="message.widget === 'setup_webhook' && message.widgetDone"
              color="primary"
              variant="subtle"
              size="sm"
              icon="i-lucide-check"
            >
              {{ $t('__labelFermionWebhookConnected') }}
            </UBadge>

            <BotClaimWidget
              v-if="message.widget === 'bot_test' && message.widgetBotId && !message.widgetDone"
              :bot-id="message.widgetBotId"
              @replied="onBotReplied(i)"
            />

            <UBadge
              v-else-if="message.widget === 'bot_test' && message.widgetDone"
              color="primary"
              variant="subtle"
              size="sm"
              icon="i-lucide-party-popper"
            >
              {{ $t('__labelFermionBotClaimed') }}
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
