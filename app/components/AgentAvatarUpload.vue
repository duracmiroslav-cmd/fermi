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
const uploading = ref(false);
const errorMessage = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const openPicker = () => {
  errorMessage.value = null;
  fileInputRef.value?.click();
};

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

  errorMessage.value = null;

  if (!ALLOWED_MIME.includes(file.type)) {
    errorMessage.value = 'Unsupported format. PNG, JPEG, WebP, or GIF only.';
    input.value = '';
    return;
  }
  if (file.size > MAX_BYTES) {
    errorMessage.value = 'File too large. Max 2MB.';
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
  }
  catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Upload failed';
  }
  finally {
    uploading.value = false;
    input.value = '';
  }
};

const onRemove = async () => {
  errorMessage.value = null;
  uploading.value = true;
  try {
    if (!user.value) throw new Error('Not signed in');
    await removeExistingForAgent(user.value.id);
    emit('change', null);
  }
  catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Remove failed';
  }
  finally {
    uploading.value = false;
  }
};
</script>

<template>
  <div class="flex items-start gap-5">
    <UAvatar
      :src="currentUrl ?? undefined"
      :alt="`Agent avatar`"
      text="?"
      size="2xl"
    />
    <div class="flex-1 min-w-0 space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          :loading="uploading"
          @click="openPicker"
        >
          {{ currentUrl ? 'Replace' : 'Upload' }}
        </UButton>
        <UButton
          v-if="currentUrl"
          color="error"
          variant="ghost"
          size="sm"
          :disabled="uploading"
          @click="onRemove"
        >
          Remove
        </UButton>
      </div>

      <p
        v-if="errorMessage"
        class="font-mono text-xs text-error"
      >
        ! {{ errorMessage }}
      </p>
      <p
        v-else
        class="font-mono text-xs text-dimmed"
      >
        PNG / JPEG / WebP / GIF · max 2MB
      </p>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      class="hidden"
      @change="onFileChange"
    >
  </div>
</template>
