<script setup lang="ts">
import { PURPOSE_LABEL, type Purpose } from '~~/shared/constants/limits';

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
        <DashboardBreadcrumb :items="[{ label: 'Usage' }]" />
      </template>

      <DashboardContainer>
        <header class="flex flex-col gap-2">
          <h1 class="text-2xl font-semibold">
            Usage
          </h1>
          <p class="text-sm text-toned">
            Monthly caps reset on the 1st of each month (UTC). Current window: <span class="font-mono">{{ periodLabel }}</span>.
          </p>
        </header>

        <section
          v-if="usagePending && !usage"
          class="flex flex-col gap-3"
          aria-busy="true"
        >
          <div
            v-for="i in 5"
            :key="i"
            class="p-4 rounded-md ring ring-inset ring-muted bg-muted/50 animate-pulse flex flex-col gap-2"
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
          class="flex flex-col gap-3"
        >
          <BaseCard
            v-for="item in usage.items"
            :key="item.purpose"
            class="flex flex-col gap-2"
          >
            <div class="flex items-baseline justify-between">
              <span class="font-medium text-highlighted">
                {{ PURPOSE_LABEL[item.purpose] }}
              </span>
              <span class="text-sm text-toned font-mono">
                {{ item.used }} / {{ item.cap }}
              </span>
            </div>
            <UProgress :model-value="getPercent(item)" />
          </BaseCard>
        </section>

        <BaseCard
          v-if="profile?.tier === 'free'"
          class="flex flex-col gap-3"
        >
          <div class="flex flex-col gap-1">
            <span class="font-medium text-highlighted">
              升 Pro 解鎖更高 cap
            </span>
            <span class="text-sm text-toned">
              Pro 方案每月生圖 200、語音回覆 500、語音輸入 500、長對話 100。撞頂可 BYO key（OpenAI / fal.ai）真正 unlimited。
            </span>
          </div>
          <UButton
            to="/dashboard/billing"
            color="primary"
            class="self-start"
          >
            升 Pro
          </UButton>
        </BaseCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
