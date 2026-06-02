<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { Locale } from '~~/shared/locale';

const { locale, locales, setLocale } = useI18n();
const user = useSupabaseUser();

const open = ref(false);

const switchTo = async (code: Locale) => {
  open.value = false;
  if (code === locale.value) return;
  await setLocale(code);
  // Persist for logged-in users so the choice follows them across devices and
  // matches the locale the LINE worker replies in. Anonymous users rely on the
  // i18n_redirected cookie setLocale just wrote.
  if (user.value) {
    $fetch('/api/me/profile', {
      method: 'PATCH',
      body:   { locale: code },
    }).catch(err => console.warn('locale sync failed', err));
  }
};

const items = computed<DropdownMenuItem[]>(() =>
  locales.value.map(l => ({
    label:           l.name,
    type:            'checkbox',
    checked:         l.code === locale.value,
    onUpdateChecked: () => switchTo(l.code as Locale),
  })),
);
</script>

<template>
  <UDropdownMenu
    v-model:open="open"
    :items="items"
  >
    <UButton
      icon="i-lucide-languages"
      color="neutral"
      variant="ghost"
      size="sm"
      :aria-label="$t('__actionSwitchLanguage')"
    />
  </UDropdownMenu>
</template>
