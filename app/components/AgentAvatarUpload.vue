<script setup lang="ts">
const props = defineProps<{
  agentId: string;
  currentUrl: string | null;
}>();

const emit = defineEmits<{
  change: [url: string | null];
}>();

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 2 * 1024 * 1024;
const BUCKET = 'agent-avatars';

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const notify = useNotify();
const uploading = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const openPicker = () => fileInputRef.value?.click();

const removeExistingForAgent = async (userId: string) => {
  const { data: files, error } = await supabase.storage.from(BUCKET).list(userId);
  if (error) throw error;
  const matches = (files ?? []).filter(f => f.name.startsWith(`${props.agentId}.`));
  if (matches.length === 0) return;
  const paths = matches.map(f => `${userId}/${f.name}`);
  const { error: removeErr } = await supabase.storage.from(BUCKET).remove(paths);
  if (removeErr) throw removeErr;
};

const onFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!ALLOWED_MIME.includes(file.type)) {
    notify.error('Unsupported format', 'PNG, JPEG, WebP, or GIF only.');
    input.value = '';
    return;
  }
  if (file.size > MAX_BYTES) {
    notify.error('File too large', 'Max 2MB.');
    input.value = '';
    return;
  }

  uploading.value = true;
  try {
    if (!user.value) throw new Error('Not signed in');
    await removeExistingForAgent(user.value.id);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${user.value.id}/${props.agentId}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (uploadErr) throw uploadErr;
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    emit('change', publicUrl);
  } catch (e) {
    notify.error('Upload failed', e);
  } finally {
    uploading.value = false;
    input.value = '';
  }
};
</script>

<template>
  <UTooltip :text="currentUrl ? 'Replace avatar' : 'Upload avatar'">
    <button
      type="button"
      :disabled="uploading"
      class="relative size-12 shrink-0 rounded-full overflow-hidden bg-primary/10 hover:bg-primary/20 transition-colors group disabled:opacity-60 cursor-pointer"
      @click="openPicker"
    >
      <img
        v-if="currentUrl && !uploading"
        :src="currentUrl"
        alt=""
        class="absolute inset-0 size-full object-cover transition-opacity group-hover:opacity-50"
      >
      <UIcon
        v-if="uploading"
        name="i-lucide-loader-circle"
        class="absolute inset-0 m-auto size-5 text-primary animate-spin"
      />
      <template v-else>
        <AgentAvatar
          v-if="!currentUrl"
          :name="null"
          :seed="agentId"
          size="3xl"
          class="absolute inset-0 transition-opacity group-hover:opacity-0"
        />
        <UIcon
          name="i-lucide-camera"
          class="absolute inset-0 m-auto size-5 text-primary opacity-0 transition-opacity group-hover:opacity-100"
        />
      </template>
    </button>
  </UTooltip>

  <input
    ref="fileInputRef"
    type="file"
    accept="image/png,image/jpeg,image/webp,image/gif"
    class="hidden"
    @change="onFileChange"
  >
</template>
