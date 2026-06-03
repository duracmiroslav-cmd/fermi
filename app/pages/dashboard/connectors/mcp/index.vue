<script setup lang="ts">
import type { ByoMcpServer } from '~~/server/utils/mcp';

definePageMeta({ layout: false });

const { data: servers, pending, deletingId, remove } = useByoMcp();

// Cycled widths so skeleton rows read as distinct items, not one repeated.
const ROW_TITLE_WIDTHS = ['w-32', 'w-40', 'w-28'];
const ROW_URL_WIDTHS = ['w-56', 'w-64', 'w-48'];

const serverToDelete = ref<ByoMcpServer | null>(null);

const isDeleteOpen = computed({
  get: () => serverToDelete.value !== null,
  set: (v: boolean) => { if (!v) serverToDelete.value = null; },
});

const onConfirmDelete = async () => {
  const target = serverToDelete.value;
  if (!target) return;
  await remove(target);
  serverToDelete.value = null;
};
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: $t('__labelConnector', 2), to: '/dashboard/connectors' },
            { label: $t('__titleCustomMcpServers') },
          ]"
        />
      </template>

      <DashboardContainer>
        <header class="flex items-center gap-4">
          <div class="size-12 rounded-full bg-muted flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-server"
              class="size-6 text-default"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              {{ $t('__titleCustomMcpServers') }}
            </h1>
            <p class="text-sm text-toned mt-1">
              {{ $t('__descriptionCustomMcpServers') }}
            </p>
          </div>
          <UButton
            v-if="servers?.length"
            to="/dashboard/connectors/mcp/new"
            icon="i-lucide-plus"
            size="sm"
            class="shrink-0"
          >
            {{ $t('__actionConnectMcpServer') }}
          </UButton>
        </header>

        <div
          v-if="pending && !servers"
          class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
          aria-busy="true"
        >
          <div
            v-for="i in 3"
            :key="i"
            class="flex items-center gap-4 p-4"
          >
            <USkeleton class="size-5 rounded shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="h-5 flex items-center">
                <USkeleton
                  class="h-3"
                  :class="ROW_TITLE_WIDTHS[(i - 1) % ROW_TITLE_WIDTHS.length]"
                />
              </div>
              <div class="h-4 flex items-center">
                <USkeleton
                  class="h-2.5 bg-muted/70"
                  :class="ROW_URL_WIDTHS[(i - 1) % ROW_URL_WIDTHS.length]"
                />
              </div>
            </div>
            <USkeleton class="size-8 rounded-md shrink-0" />
          </div>
        </div>

        <div
          v-else-if="servers && servers.length"
          class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
        >
          <div
            v-for="server in servers"
            :key="server.id"
            class="flex items-center gap-4 p-4"
          >
            <UIcon
              name="i-lucide-server"
              class="size-5 text-toned shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium truncate">
                  {{ server.displayName }}
                </p>
                <UIcon
                  v-if="server.hasToken"
                  name="i-lucide-lock"
                  class="size-3.5 text-toned shrink-0"
                  :aria-label="$t('__statusAuthenticated')"
                />
              </div>
              <p class="text-xs text-toned truncate">
                {{ server.url }}
              </p>
            </div>
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              icon="i-lucide-trash-2"
              :loading="deletingId === server.id"
              :aria-label="$t('__actionDelete')"
              @click="serverToDelete = server"
            />
          </div>
        </div>

        <UEmpty
          v-else
          variant="subtle"
          icon="i-lucide-server"
          :title="$t('__titleNoMcpServers')"
          :description="$t('__descriptionNoMcpServers')"
          :actions="[{ label: $t('__actionConnectFirstMcpServer'), icon: 'i-lucide-plus', to: '/dashboard/connectors/mcp/new' }]"
        />
      </DashboardContainer>

      <DeleteConfirmDialog
        v-model:open="isDeleteOpen"
        :title="$t('__titleDeleteMcpServer')"
        :item-name="serverToDelete?.displayName ?? ''"
        :confirm-label="$t('__actionDelete')"
        :loading="deletingId !== null"
        @confirm="onConfirmDelete"
      >
        <I18nT
          keypath="__descriptionDeleteMcpServerConfirm"
          tag="span"
        >
          <template #name>
            <span class="font-medium text-default">{{ serverToDelete?.displayName }}</span>
          </template>
        </I18nT>
      </DeleteConfirmDialog>
    </NuxtLayout>
  </div>
</template>
