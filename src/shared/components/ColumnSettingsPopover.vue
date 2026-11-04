<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { IconDragDotVertical, IconUndo } from '@arco-design/web-vue/es/icon';

export interface ColumnSettingsItem {
  key: string;
  label: string;
  visible: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
  visible: boolean;
  items: ColumnSettingsItem[];
  defaultItems: ColumnSettingsItem[];
  title: string;
  listAriaLabel: string;
  showLabel: string;
  restoreLabel: string;
}>(), {});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  change: [items: ColumnSettingsItem[]];
}>();

const displayedItems = ref<ColumnSettingsItem[]>([]);
const draggedKey = ref<string | null>(null);
const dropTarget = ref<{ key: string; edge: 'before' | 'after' } | null>(null);

function cloneItems(items: ColumnSettingsItem[]) {
  return items.map((item) => ({ ...item }));
}

function syncItems(items: ColumnSettingsItem[]) {
  displayedItems.value = cloneItems(items);
}

function clearDrag() {
  draggedKey.value = null;
  dropTarget.value = null;
}

function emitChange(items = displayedItems.value) {
  syncItems(items);
  emit('change', cloneItems(displayedItems.value));
}

function setVisible(item: ColumnSettingsItem, visible: boolean | (string | number | boolean)[]) {
  // 独立的 a-checkbox 只会抛 boolean；数组形态来自 checkbox-group，这里不接
  if (item.disabled || typeof visible !== 'boolean') return;
  item.visible = visible;
  emitChange();
}

function startDrag(event: DragEvent, key: string) {
  const item = displayedItems.value.find((candidate) => candidate.key === key);
  if (!item || item.disabled) {
    event.preventDefault();
    return;
  }
  draggedKey.value = key;
  dropTarget.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
  }
}

function insertionAt(event: DragEvent, key: string) {
  const fromIndex = displayedItems.value.findIndex((item) => item.key === draggedKey.value);
  const targetIndex = displayedItems.value.findIndex((item) => item.key === key);
  if (fromIndex < 0 || targetIndex < 0) return null;
  const row = event.currentTarget as HTMLElement;
  const edge: 'before' | 'after' = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2 ? 'before' : 'after';
  const insertionIndex = targetIndex + (edge === 'after' ? 1 : 0);
  const finalIndex = insertionIndex > fromIndex ? insertionIndex - 1 : insertionIndex;
  if (finalIndex === fromIndex) return null;
  // A locked field must not shift position when another field moves across it.
  const crossed = displayedItems.value.slice(Math.min(fromIndex, finalIndex), Math.max(fromIndex, finalIndex) + 1);
  if (crossed.some((item) => item.disabled)) return null;
  return { key, edge, finalIndex };
}

function overItem(event: DragEvent, key: string) {
  const target = insertionAt(event, key);
  dropTarget.value = target ? { key: target.key, edge: target.edge } : null;
  if (!target) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function leaveList(event: DragEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
    dropTarget.value = null;
  }
}

function dropItem(event: DragEvent, key: string) {
  const target = insertionAt(event, key);
  if (!target) {
    clearDrag();
    return;
  }
  event.preventDefault();
  const fromIndex = displayedItems.value.findIndex((item) => item.key === draggedKey.value);
  const [moved] = displayedItems.value.splice(fromIndex, 1);
  displayedItems.value.splice(target.finalIndex, 0, moved);
  clearDrag();
  emitChange();
}

/**
 * 拖拽之外的键盘等价操作（Alt + ↑/↓）。
 * 界面上不再提供 ↑↓ 按钮，但键盘用户仍需要排序能力，所以保留这条无可见控件的快捷键路径。
 */
function moveItem(key: string, direction: -1 | 1) {
  const index = displayedItems.value.findIndex((item) => item.key === key);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= displayedItems.value.length) return;
  if (displayedItems.value[index].disabled || displayedItems.value[targetIndex].disabled) return;
  const [moved] = displayedItems.value.splice(index, 1);
  displayedItems.value.splice(targetIndex, 0, moved);
  emitChange();
}

function restoreDefaults() {
  clearDrag();
  emitChange(props.defaultItems);
}

function handleVisibleChange(value: boolean) {
  if (value) syncItems(props.items);
  else clearDrag();
  emit('update:visible', value);
}

/**
 * Arco 的 Popover 只处理点击外部，不处理 Esc；这里补上，
 * 让"点外面或按 Esc 关闭"这条交互约定真的成立。
 */
function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !props.visible) return;
  event.stopPropagation();
  emit('update:visible', false);
}

watch(() => props.visible, (value) => {
  if (value) syncItems(props.items);
  else clearDrag();
  if (value) window.addEventListener('keydown', handleEscape, true);
  else window.removeEventListener('keydown', handleEscape, true);
});

watch(() => props.items, (items) => {
  if (props.visible) syncItems(items);
});

onBeforeUnmount(() => window.removeEventListener('keydown', handleEscape, true));
</script>

<template>
  <a-popover
    :popup-visible="visible"
    trigger="click"
    position="br"
    content-class="column-settings-popover"
    @popup-visible-change="handleVisibleChange"
  >
    <slot />
    <template #content>
      <div class="column-settings-popover-content" role="dialog" :aria-label="title">
        <div class="column-settings-list" role="list" :aria-label="listAriaLabel" @dragleave="leaveList">
          <div
            v-for="item in displayedItems"
            :key="item.key"
            class="column-settings-row"
            :class="{
              'is-disabled': item.disabled,
              'is-dragging': draggedKey === item.key,
              'is-drop-before': dropTarget?.key === item.key && dropTarget.edge === 'before',
              'is-drop-after': dropTarget?.key === item.key && dropTarget.edge === 'after',
            }"
            :draggable="!item.disabled"
            role="listitem"
            :tabindex="item.disabled ? -1 : 0"
            :aria-keyshortcuts="item.disabled ? undefined : 'Alt+ArrowUp Alt+ArrowDown'"
            @dragstart="startDrag($event, item.key)"
            @dragover="overItem($event, item.key)"
            @drop="dropItem($event, item.key)"
            @dragend="clearDrag"
            @keydown.alt.up.prevent="moveItem(item.key, -1)"
            @keydown.alt.down.prevent="moveItem(item.key, 1)"
          >
            <a-checkbox :model-value="item.visible" :disabled="item.disabled" :aria-label="`${showLabel}${item.label}`" @change="setVisible(item, $event)" />
            <span class="column-settings-label">{{ item.label }}</span>
            <span class="column-settings-drag-handle" aria-hidden="true"><IconDragDotVertical /></span>
          </div>
        </div>
        <div class="column-settings-footer">
          <button type="button" class="column-settings-restore" @click="restoreDefaults"><IconUndo />{{ restoreLabel }}</button>
        </div>
      </div>
    </template>
  </a-popover>
</template>

<style>
.column-settings-popover { padding: 0 !important; }
.column-settings-popover-content { width: 240px; padding: 8px; }
.column-settings-list { max-height: 360px; overflow-y: auto; }
.column-settings-row { position: relative; display: flex; align-items: center; min-height: 36px; gap: 8px; padding: 2px 4px; border-radius: 4px; cursor: grab; }
.column-settings-row:hover { background: var(--color-fill-2); }
.column-settings-row:focus-visible { background: var(--color-fill-2); outline: 2px solid var(--app-accent); outline-offset: -2px; }
.column-settings-row:active { cursor: grabbing; }
.column-settings-row.is-dragging { opacity: .55; }
.column-settings-row.is-drop-before, .column-settings-row.is-drop-after { background: var(--color-primary-light-1); }
.column-settings-row.is-drop-before::before, .column-settings-row.is-drop-after::before {
  position: absolute; z-index: 1; right: 2px; left: 2px; height: 3px;
  border-radius: 2px; background: var(--app-accent); content: ''; pointer-events: none;
}
.column-settings-row.is-drop-before::before { top: 0; }
.column-settings-row.is-drop-after::before { bottom: 0; }
.column-settings-row.is-disabled { cursor: not-allowed; opacity: .65; }
.column-settings-label { flex: 1; min-width: 0; color: var(--color-text-2); font-size: 14px; line-height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.column-settings-drag-handle { display: inline-flex; color: var(--color-text-4); font-size: 16px; }
/* 分割线挂在 footer 上并左右出血，否则 border 只按 inline-flex 的内容宽度画出一小截 */
.column-settings-footer { margin: 8px -8px -8px; padding: 8px; border-top: 1px solid var(--app-divider); }
.column-settings-restore { display: flex; align-items: center; gap: 4px; width: 100%; padding: 4px; border: 0; border-radius: 4px; color: var(--color-text-2); background: transparent; font-size: 12px; line-height: 20px; text-align: left; cursor: pointer; }
.column-settings-restore:hover { color: var(--app-color-primary); background: var(--color-fill-2); }
</style>
