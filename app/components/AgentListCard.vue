<script setup lang="ts">
import { resolveTextModel } from '~~/shared/constants/models';

interface CardAgent {
  id:               string;
  name:             string;
  avatarUrl:        string | null;
  isDefault:        boolean;
  defaultTextModel: string | null;
  updatedAt:        string;
}

interface ProviderModel {
  id:     string;
  name:   string;
  avatar: { icon: string };
}

const props = defineProps<{
  agent: CardAgent;
}>();

// Each card resolves its own model from the catalog; Nuxt dedupes the fetch
// by URL, so N cards share one request (mirrors BotListCard's status fetch).
const { data: models } = useApiFetch<ProviderModel[]>('/api/providers/openrouter/models');

const modelsById = computed(
  () => new Map((models.value ?? []).map(m => [m.id, m])),
);

// OpenRouter names come as "Provider: Model"; the logo already carries the
// provider, so the prefix is stripped to avoid duplicating it.
const getModel = (id: string): ProviderModel => {
  const m = modelsById.value.get(id) ?? { id, name: id, avatar: { icon: 'i-lucide-sparkles' } };
  return { ...m, name: m.name.replace(/^[^:]+:\s*/, '') };
};

// The effective text model a run uses (own pick or platform default),
// resolved to its catalog entry, with the inherited-default flag.
const textModel = computed(() => {
  const { id, isDefault } = resolveTextModel(props.agent.defaultTextModel);
  return { ...getModel(id), isDefault };
});
</script>

<template>
  <NuxtLink
    :to="`/dashboard/agents/${agent.id}`"
    class="block"
  >
    <UCard variant="interactive">
      <div class="flex items-center gap-4">
        <AgentAvatar
          :src="agent.avatarUrl"
          :name="agent.name"
          :seed="agent.id"
          size="lg"
        />
        <div class="flex-1 min-w-0 flex flex-col gap-0.5">
          <div class="flex items-center gap-2">
            <p class="font-medium truncate">
              {{ agent.name }}
            </p>
            <UBadge
              v-if="agent.isDefault"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              {{ $t('__labelDefault') }}
            </UBadge>
          </div>
          <div class="flex items-center gap-1.5 text-sm text-toned min-w-0">
            <template v-if="models">
              <UIcon
                :name="textModel.avatar.icon"
                class="size-4 shrink-0"
              />
              <span class="truncate">
                {{ textModel.name }}
                <span
                  v-if="textModel.isDefault"
                  class="text-toned"
                >{{ $t('__labelDefaultSuffix') }}</span>
              </span>
            </template>
            <template v-else>
              <USkeleton class="size-4 rounded shrink-0" />
              <div class="h-5 flex items-center">
                <USkeleton class="h-3 w-24" />
              </div>
            </template>
          </div>
        </div>
        <I18nT
          keypath="__hintEditedAt"
          tag="span"
          class="text-xs text-toned shrink-0"
        >
          <template #time>
            <TimeAgo :date="agent.updatedAt" />
          </template>
        </I18nT>
      </div>
    </UCard>
  </NuxtLink>
</template>
