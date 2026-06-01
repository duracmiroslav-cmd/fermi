<script setup lang="ts">
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-tw';

dayjs.extend(relativeTime);

const props = defineProps<{
  date: string | Date;
}>();

const { locale } = useI18n();
const now = useNow({ interval: 30_000 });

// dayjs uses zh-tw / zh-cn; vue-i18n uses zh-Hant / zh-Hans. Map at the call site.
const value = computed(() => {
  const code = locale.value === 'en' ? 'en' : 'zh-tw';
  return dayjs(props.date).locale(code).from(now.value);
});
</script>

<template>{{ value }}</template>
