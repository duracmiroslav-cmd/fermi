<script setup lang="ts">
import type { Locale } from '~~/shared/locale';

definePageMeta({ layout: false });

const { t, locale, locales, setLocale } = useI18n();
const notify = useNotify();
const profile = useProfile();

const selectedLocale = ref<Locale>((profile.value?.locale as Locale) ?? (locale.value as Locale));
const selectedTimezone = ref<string>(profile.value?.timezone ?? '');
const saving = ref(false);

const localeItems = computed(() =>
  locales.value.map(l => ({ label: l.name, value: l.code })),
);
const timezoneItems = computed(() =>
  Intl.supportedValuesOf('timeZone').map(tz => ({ label: tz, value: tz })),
);

const onSave = async () => {
  saving.value = true;
  try {
    await $fetch('/api/me/profile', {
      method: 'PATCH',
      body:   { locale: selectedLocale.value, timezone: selectedTimezone.value },
    });
    // Apply the chosen language to the live UI; the middleware reapplies it on
    // future loads, and setLocale also re-syncs the i18n_redirected cookie.
    if (selectedLocale.value !== locale.value) await setLocale(selectedLocale.value);
    if (profile.value) {
      profile.value.locale = selectedLocale.value;
      profile.value.timezone = selectedTimezone.value;
    }
    notify.success(t('__toastSaved'));
  } catch (e) {
    notify.error(t('__toastSaveFailed'), e);
  } finally {
    saving.value = false;
  }
};

// confirm.vue seeds the zone on first login; guard the rare unset case so the
// picker still shows the user's current zone. Reading it in onMounted (not the
// ref initializer) keeps SSR markup stable — the browser zone is client-only.
onMounted(() => {
  if (!selectedTimezone.value) {
    selectedTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
});
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb :items="[{ label: $t('__titleSettings') }]" />
      </template>

      <DashboardContainer>
        <h1 class="text-2xl font-semibold">
          {{ $t('__titleSettings') }}
        </h1>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              {{ $t('__titleGeneral') }}
            </h2>
            <UButton
              :loading="saving"
              size="sm"
              @click="onSave"
            >
              {{ $t('__actionSave') }}
            </UButton>
          </div>
          <UCard>
            <div class="space-y-4">
              <UFormField :label="$t('__labelLanguage')">
                <USelect
                  v-model="selectedLocale"
                  :items="localeItems"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="$t('__labelTimezone')">
                <USelectMenu
                  v-model="selectedTimezone"
                  :items="timezoneItems"
                  value-key="value"
                  class="w-full"
                  :ui="{ itemTrailingIcon: 'hidden' }"
                />
              </UFormField>
            </div>
          </UCard>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
