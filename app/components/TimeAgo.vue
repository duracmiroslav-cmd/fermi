<script setup lang="ts">
const props = defineProps<{
  date: string | Date;
}>();

const value = useTimeAgo(() => new Date(props.date));
</script>

<template>{{ value }}</template>
