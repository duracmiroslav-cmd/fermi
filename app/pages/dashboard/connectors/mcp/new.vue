<script setup lang="ts">
import { z } from 'zod';

definePageMeta({ layout: false });

const { t } = useI18n();
const { create, isSubmitting } = useByoMcp();

const schema = z.object({
  displayName: z.string().trim().min(1, t('__errorMcpServerNameRequired')),
  url:         z.string().trim().url(t('__errorMcpServerUrlRequired')),
  token:       z.string().trim(),
}).strict();

const state = reactive({
  displayName: '',
  url:         '',
  token:       '',
});

const onSubmit = async () => {
  const ok = await create({
    displayName: state.displayName,
    url:         state.url,
    token:       state.token || undefined,
  });
  if (ok) await navigateTo('/dashboard/connectors/mcp');
};
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: $t('__labelConnector', 2), to: '/dashboard/connectors' },
            { label: $t('__titleCustomMcpServers'), to: '/dashboard/connectors/mcp' },
            { label: $t('__actionAddMcpServer') },
          ]"
        />
      </template>

      <DashboardContainer>
        <h1 class="text-2xl font-semibold">
          {{ $t('__actionAddMcpServer') }}
        </h1>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <p class="font-medium">
                {{ $t('__titleSettings') }}
              </p>
              <div class="flex items-center gap-2">
                <UButton
                  to="/dashboard/connectors/mcp"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                >
                  {{ $t('__actionCancel') }}
                </UButton>
                <UButton
                  type="submit"
                  form="mcp-connect-form"
                  :loading="isSubmitting"
                  size="sm"
                >
                  {{ $t('__actionAddMcpServer') }}
                </UButton>
              </div>
            </div>
          </template>

          <UForm
            id="mcp-connect-form"
            :schema="schema"
            :state="state"
            class="flex flex-col gap-6"
            @submit="onSubmit"
          >
            <UFormField
              :label="$t('__labelMcpServerName')"
              name="displayName"
              required
              :help="$t('__hintMcpServerName')"
            >
              <UInput
                v-model.trim="state.displayName"
                autocomplete="off"
              />
            </UFormField>

            <UFormField
              :label="$t('__labelMcpServerUrl')"
              name="url"
              required
              :help="$t('__hintMcpServerUrl')"
            >
              <UInput
                v-model.trim="state.url"
                icon="i-lucide-link"
                placeholder="https://example.com/mcp"
                autocomplete="off"
              />
            </UFormField>

            <UFormField
              :label="$t('__labelBearerToken')"
              name="token"
              :help="$t('__hintMcpServerToken')"
            >
              <UInput
                v-model.trim="state.token"
                icon="i-lucide-key-round"
                type="password"
                autocomplete="off"
              />
            </UFormField>
          </UForm>
        </UCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
