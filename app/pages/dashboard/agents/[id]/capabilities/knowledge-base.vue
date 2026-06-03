<script setup lang="ts">
definePageMeta({ layout: false });

// Knowledge-base-specific editor route (resolves before `[slug].vue` for
// `/capabilities/knowledge-base`). Reuses the capability editor composable
// for the attach/detach chrome, but renders its own body: a document manager
// rather than the tool/settings form, and no Save bar (documents mutate
// immediately via their own endpoints).
const route = useRoute();
const ctx = useAgentCapabilityEditor({
  agentId: () => route.params.id as string,
  slug:    'knowledge-base',
});
const { capability, pending, attaching, onAttachToggle, statusHeadline, breadcrumbItems, agentId } = ctx;

const {
  documents,
  pending: pendingDocs,
  isAdding,
  deletingId,
  add,
  remove,
} = useKnowledge(() => route.params.id as string);

const addOpen = ref(false);
const form = reactive({ title: '', text: '' });

const DOC_WIDTHS = ['w-40', 'w-32', 'w-48'];

const onAdd = async () => {
  if (!form.title || !form.text) return;
  const ok = await add({ title: form.title, text: form.text });
  if (ok) {
    form.title = '';
    form.text = '';
    addOpen.value = false;
  }
};
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="breadcrumbItems"
          :loading="!capability"
        />
      </template>

      <DashboardDetailSkeleton v-if="pending && !capability" />

      <DashboardContainer v-else-if="capability">
        <header class="flex items-center gap-4">
          <div class="size-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <UIcon
              :name="getCapabilityIcon(capability.slug)"
              class="size-6 text-primary"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              {{ capability.displayName }}
            </h1>
            <p class="text-sm text-toned mt-1">
              {{ statusHeadline }}
            </p>
          </div>
          <USwitch
            :model-value="capability.attached"
            :disabled="attaching"
            @update:model-value="onAttachToggle"
          />
        </header>

        <p
          v-if="capability.description"
          class="text-sm text-default"
        >
          {{ capability.description }}
        </p>

        <UAlert
          v-if="!capability.attached"
          icon="i-lucide-info"
          color="neutral"
          variant="subtle"
          :title="$t('__hintKnowledgeNotAttached')"
        />

        <section class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              {{ $t('__titleKnowledgeDocuments') }}
            </h2>
            <UButton
              icon="i-lucide-plus"
              size="sm"
              :label="$t('__actionAddDocument')"
              @click="addOpen = true"
            />
          </div>

          <div
            v-if="pendingDocs && !documents"
            class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
          >
            <div
              v-for="i in 3"
              :key="i"
              class="flex items-center gap-4 p-4"
            >
              <USkeleton class="size-5 shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="h-5 flex items-center">
                  <USkeleton
                    class="h-3"
                    :class="DOC_WIDTHS[(i - 1) % DOC_WIDTHS.length]"
                  />
                </div>
                <div class="h-4 flex items-center">
                  <USkeleton class="h-2.5 w-20 bg-muted/70" />
                </div>
              </div>
            </div>
          </div>

          <div
            v-else-if="documents?.length"
            class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
          >
            <div
              v-for="doc in documents"
              :key="doc.id"
              class="flex items-center gap-4 p-4"
            >
              <UIcon
                name="i-lucide-file-text"
                class="size-5 text-toned shrink-0"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ doc.title }}
                </p>
                <p class="text-xs text-toned">
                  {{ $t('__labelKnowledgeCharCount', { count: doc.charCount }) }}
                  <span
                    v-if="doc.status === 'failed'"
                    class="text-error"
                  >· {{ $t('__statusFailed') }}</span>
                </p>
              </div>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                :loading="deletingId === doc.id"
                :aria-label="$t('__actionDelete')"
                @click="remove(doc.id)"
              />
            </div>
          </div>

          <UEmpty
            v-else
            variant="subtle"
            icon="i-lucide-book-open"
            :title="$t('__titleNoKnowledgeDocuments')"
            :description="$t('__descriptionNoKnowledgeDocuments')"
          />
        </section>
      </DashboardContainer>

      <DashboardContainer v-else>
        <UEmpty
          variant="subtle"
          icon="i-lucide-search-x"
          :title="$t('__titleCapabilityNotFound')"
          :description="$t('__descriptionCapabilityNotFound')"
          :actions="[{ label: $t('__actionBackToAgentSettings'), icon: 'i-lucide-arrow-left', to: `/dashboard/agents/${agentId}/edit` }]"
        />
      </DashboardContainer>
    </NuxtLayout>

    <UModal v-model:open="addOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-base font-semibold">
              {{ $t('__titleAddKnowledgeDocument') }}
            </h2>
          </template>

          <div class="flex flex-col gap-4">
            <UFormField
              :label="$t('__labelKnowledgeTitle')"
              required
            >
              <UInput
                v-model.trim="form.title"
                :placeholder="$t('__placeholderKnowledgeTitle')"
              />
            </UFormField>
            <UFormField
              :label="$t('__labelKnowledgeText')"
              :help="$t('__hintKnowledgeText')"
              required
            >
              <UTextarea
                v-model="form.text"
                :rows="12"
                :placeholder="$t('__placeholderKnowledgeText')"
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="addOpen = false"
              >
                {{ $t('__actionCancel') }}
              </UButton>
              <UButton
                :loading="isAdding"
                :disabled="!form.title || !form.text"
                @click="onAdd"
              >
                {{ $t('__actionAddDocument') }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
