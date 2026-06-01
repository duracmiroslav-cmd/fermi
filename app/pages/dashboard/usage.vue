<script setup lang="ts">
import { PURPOSE_LABEL_KEY, type Purpose } from '~~/shared/constants/limits';

definePageMeta({ layout: false });

interface UsageItem {
  purpose:   Purpose;
  used:      number;
  cap:       number;
  remaining: number;
}

interface UsageResponse { items: UsageItem[] }
interface ProfileResponse { tier: 'free' | 'pro' }

const { data: usage, pending: usagePending } = useApiFetch<UsageResponse>('/api/me/usage');
const { data: profile } = useApiFetch<ProfileResponse>('/api/me/profile');

const periodLabel = computed(() => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
});

const getPercent = (item: UsageItem): number => (
  item.cap <= 0 ? 0 : Math.min(100, Math.round((item.used / item.cap) * 100))
);
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb :items="[{ label: $t('__labelUsage') }]" />
      </template>

      <DashboardContainer>
        <header class="flex flex-col gap-2">
          <h1 class="text-2xl font-semibold">
            {{ $t('__labelUsage') }}
          </h1>
          <I18nT
            keypath="__descriptionUsagePeriod"
            tag="p"
            class="text-sm text-toned"
          >
            <template #period>
              <span class="font-mono">{{ periodLabel }}</span>
            </template>
          </I18nT>
        </header>

        <section
          v-if="usagePending && !usage"
          class="flex flex-col gap-4"
          aria-busy="true"
        >
          <div
            v-for="i in 5"
            :key="i"
            class="flex flex-col gap-2 animate-pulse"
          >
            <div class="flex items-baseline justify-between">
              <div class="h-5 flex items-center">
                <div class="h-3 w-24 rounded bg-muted" />
              </div>
              <div class="h-5 flex items-center">
                <div class="h-3 w-16 rounded bg-muted/70" />
              </div>
            </div>
            <div class="h-2 rounded bg-muted/50" />
          </div>
        </section>

        <section
          v-else-if="usage"
          class="flex flex-col gap-4"
        >
          <div
            v-for="item in usage.items"
            :key="item.purpose"
            class="flex flex-col gap-2"
          >
            <div class="flex items-baseline justify-between">
              <span class="text-sm font-medium">
                {{ $t(PURPOSE_LABEL_KEY[item.purpose]) }}
              </span>
              <span class="text-sm text-toned font-mono">
                {{ item.used }} / {{ item.cap }}
              </span>
            </div>
            <UProgress :model-value="getPercent(item)" />
          </div>
        </section>

        <section
          v-if="profile?.tier === 'free'"
          class="flex flex-col gap-3 mt-4 pt-6 border-t border-default"
        >
          <div class="flex flex-col gap-1">
            <span class="font-medium">
              {{ $t('__titleUpgradeForCaps') }}
            </span>
            <span class="text-sm text-toned">
              {{ $t('__descriptionUpgradeForCaps') }}
            </span>
          </div>
          <UButton
            to="/dashboard/billing"
            color="primary"
            class="self-start"
          >
            {{ $t('__actionUpgradeToPro') }}
          </UButton>
        </section>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
