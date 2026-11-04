<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconClose, IconSend, IconStarFill, IconUser } from '@arco-design/web-vue/es/icon';

interface ChatMessage {
  id: number;
  role: 'assistant' | 'user';
  key?: string;
  text?: string;
}

const { t } = useI18n({ useScope: 'global' });
const visible = ref(false);
const draft = ref('');
const panelRef = ref<HTMLElement | null>(null);
const launcherRef = ref<HTMLButtonElement | null>(null);
const messageListRef = ref<HTMLElement | null>(null);
const messages = ref<ChatMessage[]>([
  { id: 1, role: 'assistant', key: 'assistant.welcome' },
  { id: 2, role: 'user', key: 'assistant.question' },
  { id: 3, role: 'assistant', key: 'assistant.tasks' },
]);
let nextId = 4;

function openAssistant() {
  visible.value = true;
  nextTick(() => {
    if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    panelRef.value?.querySelector('input')?.focus();
  });
}

function closeAssistant(restoreFocus = true) {
  visible.value = false;
  if (restoreFocus) nextTick(() => launcherRef.value?.focus());
}

function sendMessage() {
  const question = draft.value.trim();
  if (!question) return;
  messages.value.push({ id: nextId++, role: 'user', text: question });
  messages.value.push({
    id: nextId++, role: 'assistant',
    key: /任务|task/i.test(question) ? 'assistant.tasks' : 'assistant.unavailable',
  });
  draft.value = '';
  nextTick(() => {
    if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
  });
}

function onOutsideClick(event: PointerEvent) {
  const target = event.target;
  if (!visible.value || !(target instanceof Node)) return;
  if (!panelRef.value?.contains(target) && !launcherRef.value?.contains(target)) closeAssistant(false);
}

function onEscape(event: KeyboardEvent) {
  if (visible.value && event.key === 'Escape') closeAssistant();
}

onMounted(() => {
  document.addEventListener('pointerdown', onOutsideClick);
  document.addEventListener('keydown', onEscape);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsideClick);
  document.removeEventListener('keydown', onEscape);
});
</script>

<template>
  <div class="assistant-root">
    <section v-if="visible" id="assistant-panel" ref="panelRef" class="assistant-panel" role="dialog" :aria-label="t('assistant.title')" aria-modal="false">
      <header class="assistant-header">
        <h2>{{ t('assistant.title') }}</h2>
        <button class="assistant-close" type="button" :aria-label="t('assistant.close')" @click="closeAssistant()"><IconClose :size="18" /></button>
      </header>
      <div ref="messageListRef" class="assistant-messages" role="log" aria-live="polite" aria-relevant="additions">
        <div v-for="message in messages" :key="message.id" class="assistant-message" :class="`assistant-message--${message.role}`">
          <span class="assistant-message-avatar" aria-hidden="true">
            <IconStarFill v-if="message.role === 'assistant'" :size="15" />
            <IconUser v-else :size="16" />
          </span>
          <p>{{ message.key ? t(message.key) : message.text }}</p>
        </div>
      </div>
      <form class="assistant-compose" @submit.prevent="sendMessage">
        <a-input v-model="draft" :placeholder="t('assistant.placeholder')" :aria-label="t('assistant.placeholder')" :max-length="500" />
        <button class="assistant-send" type="submit" :disabled="!draft.trim()" :aria-label="t('assistant.send')" :title="t('assistant.send')"><IconSend :size="19" /></button>
      </form>
    </section>
    <button ref="launcherRef" class="assistant-launcher" type="button" :aria-label="t('assistant.open')" :title="t('assistant.open')" aria-haspopup="dialog" :aria-expanded="visible" aria-controls="assistant-panel" @click="visible ? closeAssistant() : openAssistant()">
      <IconStarFill :size="23" />
    </button>
  </div>
</template>

<style scoped>
.assistant-root { position: relative; z-index: 30; }
.assistant-launcher {
  position: fixed; right: 24px; bottom: 24px; z-index: 2;
  display: grid; place-items: center; width: 48px; height: 48px;
  border: 0; border-radius: 50%; color: var(--color-white);
  background: rgb(var(--primary-6)); cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .16);
}
.assistant-launcher:hover, .assistant-send:hover:not(:disabled) { background: rgb(var(--primary-5)); }
.assistant-panel {
  position: fixed; right: 24px; bottom: 84px; z-index: 1;
  display: flex; flex-direction: column; width: min(372px, calc(100vw - 32px));
  height: min(420px, calc(100dvh - 100px)); min-height: 240px;
  overflow: hidden; border-radius: 8px; color: var(--color-text-1);
  background: var(--color-bg-popup); box-shadow: 0 8px 28px rgba(0, 0, 0, .18);
}
.assistant-header { display: flex; align-items: center; gap: 8px; flex: none; min-height: 52px; padding: 0 16px; border-bottom: 1px solid var(--color-border-2); }
.assistant-header h2 { margin: 0; font-size: 18px; font-weight: 600; }
.assistant-close { display: grid; place-items: center; width: 28px; height: 28px; margin-left: auto; border: 0; border-radius: 4px; color: var(--color-text-2); background: transparent; cursor: pointer; }
.assistant-close:hover { background: var(--color-fill-2); }
.assistant-messages { flex: 1; min-height: 0; padding: 16px; overflow-y: auto; overscroll-behavior: contain; }
.assistant-message { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px; }
.assistant-message--user { flex-direction: row-reverse; }
.assistant-message-avatar { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 50%; color: var(--color-white); background: rgb(var(--primary-6)); }
.assistant-message--user .assistant-message-avatar { color: var(--color-text-2); background: var(--color-fill-3); }
.assistant-message p { max-width: 264px; margin: 0; padding: 10px 12px; border-radius: 4px; background: var(--color-fill-2); font-size: 13px; line-height: 1.55; white-space: pre-line; overflow-wrap: anywhere; }
.assistant-message--user p { color: var(--color-white); background: rgb(var(--primary-6)); }
.assistant-compose { display: flex; gap: 8px; flex: none; padding: 12px 16px 16px; }
.assistant-compose :deep(.arco-input-wrapper) { flex: 1; min-width: 0; background: var(--color-fill-2); }
.assistant-send { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border: 0; border-radius: 4px; color: var(--color-white); background: rgb(var(--primary-6)); cursor: pointer; }
.assistant-send:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 560px) {
  .assistant-launcher { right: 16px; bottom: 16px; }
  .assistant-panel { right: 16px; bottom: 76px; }
}
</style>
