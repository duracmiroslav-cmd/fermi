<script setup lang="ts">
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-tw';

// Module-level side effect: registers the relativeTime plugin once per
// page load. `extend` is idempotent — repeat calls are no-ops.
dayjs.extend(relativeTime);

const props = defineProps<{
  date: string | Date;
}>();

const { locale } = useI18n();

// Refresh cadence matches VueUse useTimeAgo's default so "5 分鐘前" rolls
// over to "6 分鐘前" without the user touching the page.
const now = useNow({ interval: 30_000 });

// dayjs uses BCP-47-ish codes (zh-tw, zh-cn) rather than the script
// subtags vue-i18n picked (zh-Hant, zh-Hans). Local map keeps the
// dependency one-way: vue-i18n owns locale identity, dayjs is a
// renderer for that identity.
const value = computed(() => {
  const code = locale.value === 'en' ? 'en' : 'zh-tw';
  return dayjs(props.date).locale(code).from(now.value);
});
</script>

<template>{{ value }}</template>
