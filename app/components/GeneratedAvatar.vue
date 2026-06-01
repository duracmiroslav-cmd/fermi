<script lang="ts">
// Shared size vocabulary for every avatar surface, exported so the
// AgentAvatar / VoiceAvatar wrappers speak the same tokens instead of
// raw pixels. Lives here with SIZE_PX because the base owns sizing.
export type AvatarSize = '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
</script>

<script setup lang="ts">
import Avatar from 'vue-boring-avatars';

// fermi's branded boring-avatars wiring lives here, with the only two
// variants we sanction. The palette is private because nothing outside a
// generated avatar consumes it — co-locating it with the lib call keeps
// the brand decision in one place.
//
// Warm-led with cool accents: three apricot-leaning warm tones plus a
// teal and indigo. The warm majority keeps it on-brand; the two cool
// hues give the seeded hash enough spread to tell entries apart.
const PALETTE = ['#e8728c', '#f0925a', '#f3c06b', '#5bb3b0', '#7c8fd6'];

// Tokens → px, mirroring Nuxt UI's <UAvatar> sizes so a generated avatar
// lines up with an uploaded one at the same token.
const SIZE_PX: Record<AvatarSize, number> = {
  '3xs': 16,
  '2xs': 20,
  'xs':  24,
  'sm':  28,
  'md':  32,
  'lg':  36,
  'xl':  40,
  '2xl': 44,
  '3xl': 48,
};

withDefaults(defineProps<{
  seed:    string;
  variant: 'marble' | 'beam';
  size?:   AvatarSize;
}>(), {
  size: 'md',
});
</script>

<template>
  <Avatar
    :size="SIZE_PX[size]"
    :name="seed"
    :variant="variant"
    :colors="PALETTE"
    class="shrink-0"
  />
</template>
