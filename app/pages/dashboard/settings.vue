<script setup lang="ts">
import type { Locale } from '~~/shared/locale';

definePageMeta({ layout: false });

const { t, locale, locales, setLocale } = useI18n();
const notify = useNotify();
const profile = useProfile();

const selectedLocale = ref<Locale>((profile.value?.locale as Locale) ?? (locale.value as Locale));
const saving = ref(false);

const localeItems = computed(() =>
  locales.value.map(l => ({ label: l.name, value: l.code })),
);

const onSave = async () => {
  saving.value = true;
  try {
    await $fetch('/api/me/profile', {
      method: 'PATCH',
      body:   { locale: selectedLocale.value },
    });
    // Apply the chosen language to the live UI; the middleware reapplies it on
    // future loads, and setLocale also re-syncs the i18n_redirected cookie.
    if (selectedLocale.value !== locale.value) await setLocale(selectedLocale.value);
    if (profile.value) profile.value.locale = selectedLocale.value;
    notify.success(t('__toastSaved'));
  } catch (e) {
    notify.error(t('__toastSaveFailed'), e);
  } finally {
    saving.value = false;
  }
};
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
            <UFormField :label="$t('__labelLanguage')">
              <USelect
                v-model="selectedLocale"
                :items="localeItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </UCard>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
