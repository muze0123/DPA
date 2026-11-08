<script setup lang="ts">
/**
 * 分区管理 · 分区表单新建 / 编辑子页面（2026-10-30 用户裁决，二轮改版）。
 *
 * 版式（2026-10-31 用户裁决：单页两区块）：
 * - 吸顶顶栏：左面包屑（上级=分区管理，可点返回）/ 右操作 取消 / 保存草稿 / 发布
 *   （按钮样式按 DESIGN.md：非强调 = app-btn-neutral，发布 = primary）；顶栏画 1px 底描边。
 * - 页面 = 两个区块：基本信息（表单编号/名称两列、表单说明独占一行，控件 500px）+ 表单设计（标题右侧
 *   带「共 n 个字段」）；基本信息自然高度，表单设计 flex:1 撑满，底边距视口恒 16px。
 * - 基础设置：编号 / 名称 / 说明，控件统一 500px。
 * - 表单设计：区块标题「字段配置 / 共 n 个字段」；空态 = 大块「＋ 添加字段」点击区；
 *   字段行 = 拖拽把手 / 字段名称（≤50 字）/ 类型 / 必填规则 / 操作（上移·下移·删除），
 *   每个字段（含其选项配置区）是一个区块，块间 1px 分隔描边；拖拽以区块为单位，
 *   拖拽块半透明原位显示、目标块高亮 + 块缘 3px 主色插入条（交互对齐共享 ColumnSettingsPopover）；
 *   （指示符 + 拖拽把手 + 选项输入 + 删除，底部 批量编辑 / 添加选项）。
 * - 校验不通过不再用行内错误列表，改为弹窗：左页签名 + 右问题文案，
 *   底部 我知道了 / 前往修改；标题按动作区分（无法保存 / 无法发布）。
 * - 字段类型：单行文本 / 多行文本 / 单选框 / 复选框（下拉单选与是否开关已下线，数据读取时迁移）。
 * - 保存后：新建 → replace 到编辑路由；编辑 → 原地更新，已发布仍为已发布（不回退草稿、不升版本号）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import {
  IconArrowDown, IconArrowUp, IconCloseCircleFill, IconDelete, IconDragDotVertical, IconPlus,
} from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { MOCK_CURRENT_USER } from '../../surveys/data/surveys';
import {
  SECTION_FORM_FIELD_TYPES, SECTION_FORM_OPTION_TYPES, SECTION_FORM_REQUIREDNESS, createForm, findForm,
  isOptionField, nextFormNo, publishForm, sectionForms, updateForm,
  type SectionFieldOptionType, type SectionForm, type SectionFormField, type SectionFormFieldType,
  type SectionFormInput,
} from '../data/sectionForms';

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();
const OPERATOR = MOCK_CURRENT_USER.name;

const isNew = computed(() => route.name === 'section-forms-new');

const formNo = ref('');
const name = ref('');
const note = ref('');
const fields = ref<SectionFormField[]>([]);

const missing = ref(false);
const original = ref('');
const busy = ref(false);
const publishing = ref(false);

type IssueTab = 'basics' | 'design';
interface Issue { code: string; index?: number; tab: IssueTab }
const issues = ref<Issue[]>([]);
const invalidOpen = ref(false);
const invalidAction = ref<'save' | 'publish'>('publish');

const currentTitle = computed(() => t(`sectionForms.editor.${isNew.value ? 'newTitle' : 'editTitle'}`));
const dirty = computed(() => snapshot() !== original.value);

function snapshot(): string {
  return JSON.stringify({
    id: formNo.value.trim(), name: name.value.trim(), note: note.value.trim(),
    fields: fields.value.map((field) => ({ ...field, options: [...field.options] })),
  });
}
function markClean() { original.value = snapshot(); }

/** 表单编号在编辑态是主键，只读；新建态预填自动号、可自定义 */
const formNoDisabled = computed(() => !isNew.value);
const formNoPlaceholder = computed(() => (isNew.value ? t('sectionForms.editor.formNoPlaceholder') : ''));

const typeOptions = computed(() => SECTION_FORM_FIELD_TYPES.map((type) => ({ value: type, label: t(`sectionForms.editor.types.${type}`) })));
const requirednessOptions = computed(() => SECTION_FORM_REQUIREDNESS.map((value) => ({ value, label: t(`sectionForms.editor.requirednessOptions.${value}`) })));

/* ------------------------------------------------------------------ 载入 */

function loadForm() {
  missing.value = false;
  if (isNew.value) {
    const fromId = route.query.from ? String(route.query.from) : '';
    const source = fromId ? findForm(fromId) : undefined;
    // 编号预填自动取号，管理员可直接改写（自定义编号）
    formNo.value = nextFormNo();
    name.value = source ? `${source.name} 副本` : '';
    note.value = source?.note ?? '';
    fields.value = source ? source.fields.map((field) => ({ ...field, options: [...field.options] })) : [];
  } else {
    const source = findForm(String(route.params.formId ?? ''));
    if (!source) { missing.value = true; return; }
    formNo.value = source.id;
    name.value = source.name;
    note.value = source.note;
    fields.value = source.fields.map((field) => ({ ...field, options: [...field.options] }));
  }
  issues.value = [];
  invalidOpen.value = false;
  markClean();
}
watch(() => route.fullPath, () => { loadForm(); }, { immediate: true });

/* ------------------------------------------------------------------ 字段编辑 */

function addField() {
  fields.value.push({ name: '', type: 'text', requiredness: 'unconfirmed', options: [] });
}
function removeField(index: number) {
  fields.value.splice(index, 1);
}
function moveField(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= fields.value.length) return;
  const [moved] = fields.value.splice(index, 1);
  fields.value.splice(target, 0, moved);
}

function addOption(field: SectionFormField) {
  field.options.push('');
}
function removeOption(field: SectionFormField, index: number) {
  field.options.splice(index, 1);
}

/** 类型切换：改为单选框 / 复选框且还没有选项时，先给一行空选项，避免用户面对空白配置区 */
function onTypeChange(field: SectionFormField) {
  if (isOptionField(field) && !field.options.length) field.options.push('');
}

/* ------------------------------------------------------------------ 拖拽排序（字段 / 选项） */
/* 交互语言统一对齐共享 ColumnSettingsPopover（2026-11-01 用户裁决）：
   ① 拖拽源整行半透明（含 cursor: grabbing）——拖的是哪一行；
   ② 落点行浅主色底 + 行上/下缘 3px 主色插入条——即将停在哪；
   ③ 拖拽快照（drag image）取整行而非把手图标，否则光标旁只有 20px 的把手，看不出拖的是哪一行。 */

const dragFieldIndex = ref<number | null>(null);
const dropField = ref<{ index: number; edge: 'before' | 'after' } | null>(null);
const dragOption = ref<{ field: number; index: number } | null>(null);
const dropOption = ref<{ field: number; index: number; edge: 'before' | 'after' } | null>(null);

/**
 * 拖起时的公共处理：写入载荷 + 把「整行」设为拖拽快照。
 * 默认快照是被拖元素本身（只有把手那么大），指针旁几乎看不到内容，所以要显式用整行元素。
 */
function onDragStart(payload: string, event: DragEvent, row: HTMLElement | null) {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  transfer.setData('text/plain', payload);
  transfer.effectAllowed = 'move';
  if (row) {
    const bounds = row.getBoundingClientRect();
    transfer.setDragImage(row, event.clientX - bounds.left, event.clientY - bounds.top);
  }
}

/** 字段行落点：按指针在行内的上下半区决定插到目标之前 / 之后，返回最终插入下标 */
function fieldInsertion(event: DragEvent, target: number) {
  const from = dragFieldIndex.value;
  if (from === null || from === target) return null;
  const row = event.currentTarget as HTMLElement;
  const edge: 'before' | 'after' = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2 ? 'before' : 'after';
  const insertion = target + (edge === 'after' ? 1 : 0);
  const final = insertion > from ? insertion - 1 : insertion;
  return final === from ? null : { index: target, edge, final };
}

/** 选项行落点：与字段行同一口径；跨字段拖拽不接受（选项只在所属字段内排序） */
function optionInsertion(event: DragEvent, fieldIndex: number, target: number) {
  const from = dragOption.value;
  if (!from || from.field !== fieldIndex || from.index === target) return null;
  const row = event.currentTarget as HTMLElement;
  const edge: 'before' | 'after' = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2 ? 'before' : 'after';
  const insertion = target + (edge === 'after' ? 1 : 0);
  const final = insertion > from.index ? insertion - 1 : insertion;
  return final === from.index ? null : { index: target, edge, final };
}

function onFieldDragStart(index: number, event: DragEvent) {
  dragFieldIndex.value = index;
  dropField.value = null;
  onDragStart(`field:${index}`, event, (event.currentTarget as HTMLElement | null)?.closest('.field-block') as HTMLElement | null);
}
function onFieldDragOver(index: number, event: DragEvent) {
  const target = fieldInsertion(event, index);
  dropField.value = target ? { index: target.index, edge: target.edge } : null;
  if (!target) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}
function onFieldDrop(index: number, event: DragEvent) {
  const target = fieldInsertion(event, index);
  dropField.value = null;
  const from = dragFieldIndex.value;
  dragFieldIndex.value = null;
  if (!target || from === null) return;
  event.preventDefault();
  const [moved] = fields.value.splice(from, 1);
  fields.value.splice(target.final, 0, moved);
}
/** 指针拖出字段列表时清掉插入指示（对齐 ColumnSettingsPopover 的 leaveList） */
function onFieldTableDragLeave(event: DragEvent) {
  if (dragFieldIndex.value === null) return;
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
    dropField.value = null;
  }
}

function onOptionDragStart(fieldIndex: number, optionIndex: number, event: DragEvent) {
  dragOption.value = { field: fieldIndex, index: optionIndex };
  dropOption.value = null;
  onDragStart(`option:${fieldIndex}:${optionIndex}`, event, (event.currentTarget as HTMLElement | null)?.closest('.option-row') as HTMLElement | null);
}
function onOptionDragOver(fieldIndex: number, target: number, event: DragEvent) {
  const hit = optionInsertion(event, fieldIndex, target);
  dropOption.value = hit ? { field: fieldIndex, index: hit.index, edge: hit.edge } : null;
  if (!hit) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}
function onOptionDrop(fieldIndex: number, target: number, event: DragEvent) {
  const hit = optionInsertion(event, fieldIndex, target);
  dropOption.value = null;
  const from = dragOption.value;
  dragOption.value = null;
  if (!hit || !from) return;
  event.preventDefault();
  const options = fields.value[fieldIndex].options;
  const [moved] = options.splice(from.index, 1);
  options.splice(hit.final, 0, moved);
}
/** 指针离开某个字段的选项区时清掉插入指示（避免残留在别的字段里） */
function onOptionAreaDragLeave(event: DragEvent) {
  if (!dragOption.value) return;
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
    dropOption.value = null;
  }
}
function onDragEnd() {
  dragFieldIndex.value = null;
  dropField.value = null;
  dragOption.value = null;
  dropOption.value = null;
}

/* ------------------------------------------------------------------ 选项批量编辑 */

const batchOpen = ref(false);
const batchFieldIndex = ref(0);
const batchText = ref('');
const batchType = computed<SectionFieldOptionType>(() => {
  const field = fields.value[batchFieldIndex.value];
  return field && isOptionField(field) ? field.type as SectionFieldOptionType : 'radio';
});

function openBatchEdit(index: number) {
  const field = fields.value[index];
  if (!field || !isOptionField(field)) return;
  batchFieldIndex.value = index;
  batchText.value = field.options.join('\n');
  batchOpen.value = true;
}
function confirmBatchEdit() {
  const field = fields.value[batchFieldIndex.value];
  if (field) field.options = batchText.value.split('\n').map((line) => line.trim()).filter(Boolean);
  batchOpen.value = false;
}

/* ------------------------------------------------------------------ 校验 */

function validate(): boolean {
  const next: Issue[] = [];
  const id = formNo.value.trim();
  if (!id) next.push({ code: 'formNoRequired', tab: 'basics' });
  else if (sectionForms.some((item) => item.id === id) && (isNew.value || id !== String(route.params.formId ?? ''))) {
    next.push({ code: 'formNoDuplicate', tab: 'basics' });
  }
  if (!name.value.trim()) next.push({ code: 'nameRequired', tab: 'basics' });
  if (note.value.trim().length > 100) next.push({ code: 'noteTooLong', tab: 'basics' });
  if (!fields.value.length) next.push({ code: 'emptyForm', tab: 'design' });
  const seen = new Set<string>();
  fields.value.forEach((field, index) => {
    const label = field.name.trim();
    if (!label) next.push({ code: 'fieldNameRequired', index: index + 1, tab: 'design' });
    else if (seen.has(label)) next.push({ code: 'fieldNameDuplicate', index: index + 1, tab: 'design' });
    else seen.add(label);
    // 名称未填的字段不再叠加「缺选项」，避免同一行刷两条
    if (isOptionField(field) && label && !field.options.some((option) => option.trim())) {
      next.push({ code: 'optionsRequired', index: index + 1, tab: 'design' });
    }
  });
  issues.value = next;
  return next.length === 0;
}

function issueText(issue: Issue): string {
  if (issue.code === 'optionsRequired') {
    return t('sectionForms.editor.issues.optionsRequired', { name: fields.value[(issue.index ?? 1) - 1]?.name.trim() || `#${issue.index}` });
  }
  if (issue.index) return t(`sectionForms.editor.issues.${issue.code}`, { index: issue.index });
  return t(`sectionForms.editor.issues.${issue.code}`);
}

const invalidTitle = computed(() => t(`sectionForms.editor.${invalidAction.value === 'save' ? 'invalidTitleSave' : 'invalidTitlePublish'}`));
const invalidSubtitle = computed(() => t('sectionForms.editor.invalidSubtitle'));

function openInvalid(action: 'save' | 'publish') {
  invalidAction.value = action;
  invalidOpen.value = true;
}

/** 「前往修改」：定位第一条问题所在区块并聚焦该控件 */
function goFix() {
  invalidOpen.value = false;
  const issue = issues.value[0];
  if (!issue) return;
  void Promise.resolve().then(() => {
    const target = issue.tab === 'basics'
      ? document.querySelector<HTMLInputElement>(`#form-field-${issue.code === 'nameRequired' ? 'name' : issue.code === 'noteTooLong' ? 'note' : 'formNo'} input, #form-field-note textarea`)
      : document.querySelector<HTMLInputElement>(`#design-field-${(issue.index ?? 1) - 1} input`);
    target?.focus();
  });
}

/* ------------------------------------------------------------------ 保存 / 发布 */

function inputOfForm(): SectionFormInput {
  return {
    id: formNo.value.trim(),
    name: name.value,
    note: note.value,
    fields: fields.value.map((field) => ({
      name: field.name.trim(),
      type: field.type,
      requiredness: field.requiredness,
      options: isOptionField(field) ? field.options.map((option) => option.trim()).filter(Boolean) : [],
    })),
  };
}

/** 固化当前内容（校验已通过）：新建则创建草稿，编辑则原地更新（已发布仍为已发布） */
function commitForm(): SectionForm | null {
  const input = inputOfForm();
  if (isNew.value) {
    const created = createForm(input, OPERATOR);
    Message.success(t('sectionForms.messages.created', { no: created.id }));
    return created;
  }
  const id = String(route.params.formId ?? '');
  const updated = updateForm(id, { ...input, id }, OPERATOR);
  if (!updated) { Message.error(t('sectionForms.messages.storageError')); return null; }
  Message.success(t('sectionForms.messages.updated'));
  return updated;
}

/** 保存草稿：返回固化后的表单编号（校验不通过弹窗、写入失败返回空串） */
async function save(): Promise<string> {
  if (busy.value) return '';
  if (!validate()) { openInvalid('save'); return ''; }
  busy.value = true;
  try {
    const saved = commitForm();
    if (!saved) return '';
    formNo.value = saved.id;
    if (isNew.value) {
      // 新建保存后落到编辑路由，避免刷新重复建单；先复位脏标记，否则离开守卫会弹确认框
      markClean();
      await router.replace({ name: 'section-forms-edit', params: { formId: saved.id } });
    } else {
      name.value = saved.name;
      note.value = saved.note;
      fields.value = saved.fields.map((field) => ({ ...field, options: [...field.options] }));
      markClean();
    }
    return saved.id;
  } finally {
    busy.value = false;
  }
}

async function publish() {
  if (busy.value || publishing.value) return;
  if (!validate()) { openInvalid('publish'); return; }
  publishing.value = true;
  try {
    const input = inputOfForm();
    let id = String(route.params.formId ?? '');
    if (isNew.value) {
      const created = createForm(input, OPERATOR);
      id = created.id;
      Message.success(t('sectionForms.messages.created', { no: created.id }));
      markClean();
      await router.replace({ name: 'section-forms-edit', params: { formId: created.id } });
    } else {
      const updated = updateForm(id, { ...input, id }, OPERATOR);
      if (!updated) { Message.error(t('sectionForms.messages.storageError')); return; }
      Message.success(t('sectionForms.messages.updated'));
      markClean();
    }
    publishForm(id, OPERATOR);
    Message.success(t('sectionForms.messages.published'));
  } finally {
    publishing.value = false;
  }
}

function cancel() {
  void router.push({ name: 'section-forms' });
}

/**
 * 顺序列（2026-10-30 用户裁决）：显示 Excel 列位字母 A、B、C…，代表字段在表中的列；
 * 随拖拽 / 上移下移实时重排（按行下标推导，26 列后进位 AA、AB…）。
 */
function columnLetter(index: number): string {
  let rest = index;
  let label = '';
  while (rest >= 0) {
    label = String.fromCharCode(65 + (rest % 26)) + label;
    rest = Math.floor(rest / 26) - 1;
  }
  return label;
}

/* ------------------------------------------------------------------ 未保存保护 */

function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
onBeforeRouteLeave(() => !dirty.value || window.confirm(t('sectionForms.editor.discard')));
</script>

<template>
  <main class="form-edit-page">
    <header class="form-edit-header">
      <nav class="form-edit-crumbs" :aria-label="t('versionPage.breadcrumb')">
        <router-link class="form-crumb-link" :to="{ name: 'section-forms' }">{{ t('nav.sectionForms') }}</router-link>
        <span class="form-crumb-sep" aria-hidden="true">/</span>
        <span class="form-crumb-current" aria-current="page">{{ currentTitle }}</span>
      </nav>
      <div class="form-edit-actions">
        <a-button class="app-btn-neutral" @click="cancel">{{ t('sectionForms.editor.cancel') }}</a-button>
        <a-button class="app-btn-neutral" :loading="busy" @click="save">{{ t('sectionForms.editor.save') }}</a-button>
        <a-button type="primary" :loading="publishing" @click="publish">{{ t('sectionForms.editor.publish') }}</a-button>
      </div>
    </header>

    <div v-if="missing" class="version-state">
      <a-empty :description="t('sectionForms.empty.noData')" />
      <div class="version-state-action">
        <a-button type="primary" @click="cancel">{{ t('sectionForms.editor.back') }}</a-button>
      </div>
    </div>

    <template v-else>
      <!-- 区块一：基本信息（2026-10-31 用户裁决：单页两区块，控件统一 500px） -->
      <section class="version-panel form-panel-basics" :aria-label="t('sectionForms.editor.blockBasics')">
        <div class="version-panel-heading">
          <h2>{{ t('sectionForms.editor.blockBasics') }}</h2>
        </div>
        <div class="form-basics-grid">
          <div class="form-basic-field">
            <label class="app-field-label" :for="'form-field-formNo'"><span class="form-required">*</span>{{ t('sectionForms.editor.formNo') }}</label>
            <a-input
              id="form-field-formNo"
              v-model="formNo"
              class="form-basic-input"
              :disabled="formNoDisabled"
              :placeholder="formNoPlaceholder"
              :max-length="50"
              show-word-limit
            />
          </div>
          <div class="form-basic-field">
            <label class="app-field-label" :for="'form-field-name'"><span class="form-required">*</span>{{ t('sectionForms.editor.name') }}</label>
            <a-input
              id="form-field-name"
              v-model="name"
              class="form-basic-input"
              :placeholder="t('sectionForms.editor.namePlaceholder')"
              :max-length="50"
              show-word-limit
            />
          </div>
          <div class="form-basic-field form-basic-field--wide">
            <label class="app-field-label" :for="'form-field-note'">{{ t('sectionForms.editor.note') }}</label>
            <a-textarea
              id="form-field-note"
              v-model="note"
              :placeholder="t('sectionForms.editor.notePlaceholder')"
              :max-length="100"
              :auto-size="{ minRows: 3, maxRows: 5 }"
              show-word-limit
            />
          </div>
        </div>
      </section>

      <!-- 区块二：表单设计（标题右侧带「共 n 个字段」）；空态 = 大块添加区 -->
      <section class="version-panel form-panel-design" :aria-label="t('sectionForms.editor.blockDesign')">
        <div class="version-panel-heading">
          <h2>{{ t('sectionForms.editor.blockDesign') }}</h2>
          <span class="version-count">{{ t('sectionForms.editor.fieldCount', { n: fields.length }) }}</span>
        </div>
        <div v-if="fields.length" class="field-table" @dragleave="onFieldTableDragLeave">
          <div class="field-row field-row--head">
            <span aria-hidden="true" />
            <span>{{ t('sectionForms.editor.orderLabel') }}</span>
            <span>{{ t('sectionForms.editor.columnName') }}</span>
            <span>{{ t('sectionForms.editor.columnType') }}</span>
            <span>{{ t('sectionForms.editor.requiredness') }}</span>
            <span>{{ t('sectionForms.fields.actions') }}</span>
          </div>
          <div v-for="(field, index) in fields" :key="index" class="field-block"
            :class="{
              'is-dragging': dragFieldIndex === index,
              'is-drop-before': dropField?.index === index && dropField?.edge === 'before',
              'is-drop-after': dropField?.index === index && dropField?.edge === 'after',
            }"
            @dragover="onFieldDragOver(index, $event)"
            @drop="onFieldDrop(index, $event)"
          >
            <div
              class="field-row"
            >
              <span
                class="drag-handle"
                draggable="true"
                :aria-label="t('sectionForms.editor.dragHandle')"
                :title="t('sectionForms.editor.dragHandle')"
                @dragstart="onFieldDragStart(index, $event)"
                @dragend="onDragEnd"
              ><IconDragDotVertical /></span>
              <span class="field-column tabular" :title="t('sectionForms.editor.orderLabel')">{{ columnLetter(index) }}</span>
              <span class="field-name-cell">
                <span v-if="field.locked" class="version-badge">{{ t('sectionForms.editor.masterBadge') }}</span>
                <a-input
                  :id="`design-field-${index}`"
                  v-model="field.name"
                  class="field-name-input"
                  :placeholder="t('sectionForms.editor.fieldNamePlaceholder')"
                  :max-length="50"
                  :disabled="Boolean(field.locked)"
                />
              </span>
              <a-select v-model="field.type" class="field-type-select" :options="typeOptions" :aria-label="t('sectionForms.editor.columnType')" :disabled="Boolean(field.locked)" @change="onTypeChange(field)" />
              <a-select v-model="field.requiredness" class="field-required-select" :options="requirednessOptions" :aria-label="t('sectionForms.editor.requiredness')" :disabled="Boolean(field.locked)" />
              <div class="field-row-actions">
                <a-button class="icon-action app-btn-neutral" :disabled="index === 0" :aria-label="t('sectionForms.editor.moveUp')" :title="t('sectionForms.editor.moveUp')" @click="moveField(index, -1)">
                  <template #icon><IconArrowUp /></template>
                </a-button>
                <a-button class="icon-action app-btn-neutral" :disabled="index === fields.length - 1" :aria-label="t('sectionForms.editor.moveDown')" :title="t('sectionForms.editor.moveDown')" @click="moveField(index, 1)">
                  <template #icon><IconArrowDown /></template>
                </a-button>
                <a-button class="icon-action app-btn-neutral" :disabled="Boolean(field.locked)" :aria-label="t('sectionForms.editor.removeField')" :title="t('sectionForms.editor.removeField')" @click="removeField(index)">
                  <template #icon><IconDelete /></template>
                </a-button>
              </div>
            </div>

            <!-- 单选框 / 复选框：选项配置区 -->
            <div v-if="isOptionField(field)" class="field-options" @dragleave="onOptionAreaDragLeave">
              <div
                v-for="(option, optionIndex) in field.options"
                :key="optionIndex"
                class="option-row"
                :class="{
                  'is-dragging': dragOption?.field === index && dragOption?.index === optionIndex,
                  'is-drop-before': dropOption?.field === index && dropOption?.index === optionIndex && dropOption?.edge === 'before',
                  'is-drop-after': dropOption?.field === index && dropOption?.index === optionIndex && dropOption?.edge === 'after',
                }"
                @dragover="onOptionDragOver(index, optionIndex, $event)"
                @drop="onOptionDrop(index, optionIndex, $event)"
              >
                <span class="option-indicator" :class="`option-indicator--${field.type}`" aria-hidden="true" />
                <span
                  class="drag-handle drag-handle--option"
                  draggable="true"
                  :aria-label="t('sectionForms.editor.dragOptionHandle')"
                  :title="t('sectionForms.editor.dragOptionHandle')"
                  @dragstart="onOptionDragStart(index, optionIndex, $event)"
                  @dragend="onDragEnd"
                ><IconDragDotVertical /></span>
                <a-input v-model="field.options[optionIndex]" class="option-input" :placeholder="t('sectionForms.editor.optionPlaceholder')" :max-length="50" />
                <button type="button" class="option-remove" :aria-label="t('sectionForms.editor.removeOption')" :title="t('sectionForms.editor.removeOption')" @click="removeOption(field, optionIndex)">
                  <IconDelete />
                </button>
              </div>
              <div class="option-links">
                <a-link @click="openBatchEdit(index)">{{ t('sectionForms.editor.batchEdit') }}</a-link>
                <a-link @click="addOption(field)">{{ t('sectionForms.editor.addOption') }}</a-link>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="field-add-box"
          :class="{ 'field-add-box--empty': !fields.length }"
          @click="addField"
        >
          <IconPlus class="field-add-icon" aria-hidden="true" />
          <span>{{ t('sectionForms.editor.addField') }}</span>
        </button>
      </section>
    </template>

    <!-- 字段类型：单选框 / 复选框 的批量编辑弹窗 -->
    <a-modal
      :visible="batchOpen"
      :width="520"
      :title="t('sectionForms.editor.batchEditTitle', { type: t(`sectionForms.editor.types.${batchType}`) })"
      :mask-closable="true"
      @cancel="batchOpen = false"
    >
      <div class="batch-dialog">
        <p class="batch-hint">{{ t('sectionForms.editor.batchEditHint') }}</p>
        <a-textarea v-model="batchText" :auto-size="{ minRows: 6, maxRows: 10 }" />
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" @click="batchOpen = false">{{ t('sectionForms.editor.cancel') }}</a-button>
        <a-button type="primary" @click="confirmBatchEdit">{{ t('sectionForms.editor.batchEditConfirm') }}</a-button>
      </template>
    </a-modal>

    <!-- 校验不通过弹窗（保存草稿 / 发布共用）：左页签名 + 右问题文案 -->
    <a-modal
      :visible="invalidOpen"
      :width="640"
      :title="invalidTitle"
      :mask-closable="true"
      @cancel="invalidOpen = false"
    >
      <template #title>
        <span class="invalid-title">
          <IconCloseCircleFill class="invalid-title-icon" aria-hidden="true" />
          {{ invalidTitle }}
        </span>
      </template>
      <div class="invalid-dialog">
        <p class="invalid-subtitle">{{ invalidSubtitle }}</p>
        <ul class="invalid-list">
          <li v-for="(issue, index) in issues" :key="index" class="invalid-row">
            <span class="invalid-tab">{{ t(`sectionForms.editor.${issue.tab === 'basics' ? 'blockBasics' : 'blockDesign'}`) }}</span>
            <span class="invalid-text">{{ issueText(issue) }}</span>
          </li>
        </ul>
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" @click="invalidOpen = false">{{ t('sectionForms.editor.invalidGotIt') }}</a-button>
        <a-button type="primary" @click="goFix">{{ t('sectionForms.editor.invalidGoFix') }}</a-button>
      </template>
    </a-modal>
  </main>
</template>

<style scoped>
.form-edit-page { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: calc(100dvh - 88px); color: var(--color-text-1); }

/* 吸顶顶栏：面包屑在左、操作在右（2026-10-31 用户裁决：单页两区块，页签取消），1px 底描边分隔内容区 */
.form-edit-header {
  position: sticky; top: 56px; z-index: 5;
  display: flex; align-items: center; gap: 16px;
  min-width: 0; padding: 8px 16px; border-bottom: 1px solid var(--app-divider);
  border-radius: 2px; background: var(--app-surface);
  transition: box-shadow 160ms ease;
}
/* 面包屑：对齐 VersionPageHeader 口径（上级 Text-2，hover/focus 主色，当前页加粗） */
.form-edit-crumbs { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; line-height: 22px; }
.form-crumb-link { color: var(--color-text-2); text-decoration: none; }
.form-crumb-link:hover, .form-crumb-link:focus-visible { color: var(--app-accent); }
.form-crumb-link:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.form-crumb-sep { color: var(--color-text-3); }
.form-crumb-current { min-width: 0; overflow: hidden; color: var(--color-text-1); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.form-edit-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-left: auto; }

/* 单页两区块：基本信息自然高度，表单设计撑满剩余高度（底边距视口恒 16px，超高整页滚动） */
.form-panel-design { flex: 1 1 auto; }

/* 基础设置：两列（表单编号 / 表单名称并列），表单说明独占一行；控件宽 500px 不变
   （2026-11-01 用户裁决：基本信息区块字段改两列） */
.form-basics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 500px)); gap: 16px 32px; min-width: 0; }
.form-basic-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.form-basic-field--wide { grid-column: 1 / -1; }
.form-basic-field > label { color: var(--color-text-2); font-size: 14px; line-height: 22px; }
.form-required { margin-right: 4px; color: var(--app-color-danger); }
.form-basic-input { width: 100%; }

/* 表单设计：表格样式带描边（2026-10-30 用户裁决）——外框 + 区块分隔线 + 表头底色；
   每个字段 = 一个区块（字段行 + 选项配置区），拖拽/插入指示作用在整个区块上（对齐列设置交互） */
.field-table { overflow: hidden; border: 1px solid var(--app-divider); border-radius: 2px; }
.field-block { position: relative; }
.field-block + .field-block { border-top: 1px solid var(--app-divider); }
.field-block.is-dragging { opacity: .55; cursor: grabbing; }
.field-block.is-drop-before, .field-block.is-drop-after { background: var(--color-primary-light-1); }
.field-block.is-drop-before::before, .field-block.is-drop-after::before {
  position: absolute; z-index: 1; right: 0; left: 0; height: 3px;
  border-radius: 2px; background: var(--app-accent); content: ''; pointer-events: none;
}
.field-block.is-drop-before::before { top: 0; }
.field-block.is-drop-after::before { bottom: 0; }
.field-row {
  position: relative;
  display: grid; grid-template-columns: 28px 40px minmax(0, 280px) 150px 160px 104px;
  align-items: center; gap: 12px; padding: 10px 12px;
}
.field-row--head { color: var(--color-text-2); font-size: 13px; line-height: 20px; background: var(--app-table-header); border-bottom: 1px solid var(--app-divider); }
/* 顺序列：Excel 列位字母（A、B、C…），随拖拽实时重排 */
.field-column { color: var(--color-text-2); font-weight: 600; line-height: 22px; }
.drag-handle { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 28px; color: var(--color-text-3); cursor: grab; }
.field-row:hover .drag-handle { color: var(--app-accent); }
.option-row:hover .drag-handle { color: var(--app-accent); }
.drag-handle:active { cursor: grabbing; }
.drag-handle:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
/* 主数据占位：徽标 + 禁用名称输入同行 */
.field-name-cell { display: flex; align-items: center; gap: 6px; min-width: 0; }
.field-name-cell .version-badge { flex: none; }
.field-name-input { flex: 1; min-width: 0; }
.field-type-select, .field-required-select { width: 100%; }
.field-row-actions { display: flex; align-items: center; gap: 4px; }
.field-row-actions .icon-action.arco-btn { width: 28px; height: 28px; padding: 0; }

/* 选项配置区（单选框 / 复选框）：指示符 + 把手 + 选项输入 + 删除（2026-10-31 回退为 flex 版式，
   不套字段行的固定列宽网格，窄视口不会撑爆；左缘仍与字段名称列对齐） */
.field-options { display: flex; flex-direction: column; gap: 8px; padding: 4px 12px 12px 104px; }
.option-row { position: relative; display: flex; align-items: center; gap: 8px; border-radius: 2px; }
/* 拖拽中：整行半透明 + grabbing（对齐 ColumnSettingsPopover 的 is-dragging 口径） */
.option-row.is-dragging { opacity: .55; cursor: grabbing; }
/* 落点：浅主色底 + 行上/下缘 3px 主色插入条；选项行之间 8px 间距，插入条落在间距中线上 */
.option-row.is-drop-before, .option-row.is-drop-after { background: var(--color-primary-light-1); }
.option-row.is-drop-before::before, .option-row.is-drop-after::before {
  position: absolute; z-index: 1; right: 0; left: 0; height: 3px;
  border-radius: 2px; background: var(--app-accent); content: ''; pointer-events: none;
}
.option-row.is-drop-before::before { top: -5px; }
.option-row.is-drop-after::before { bottom: -5px; }
.option-indicator { flex: none; width: 14px; height: 14px; border: 1px solid var(--app-control-border); background: var(--app-surface); }
.option-indicator--radio { border-radius: 50%; }
.option-indicator--checkbox { border-radius: 2px; }
.drag-handle--option { flex: none; width: 20px; height: 28px; }
.option-input { flex: 1; min-width: 0; max-width: 420px; }
.option-remove { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; color: var(--color-text-3); background: transparent; cursor: pointer; }
.option-remove:hover, .option-remove:focus-visible { color: var(--app-color-danger); }
.option-remove:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.option-links { display: flex; align-items: center; gap: 16px; }

/* 添加字段点击区：空态为大块（用户截图），有字段时收窄为一行 */
.field-add-box {
  display: flex; width: 100%; align-items: center; justify-content: center; gap: 8px;
  min-height: 56px; margin-top: 16px; padding: 12px;
  border: 1px solid var(--app-divider); border-radius: 2px;
  color: var(--color-text-1); background: var(--app-surface); cursor: pointer;
  font: inherit; font-size: 14px; line-height: 22px;
}
.field-add-box--empty { min-height: 152px; margin-top: 0; }
.field-add-box:hover { background: var(--color-fill-1); }
.field-add-box:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.field-add-icon { flex: none; font-size: 16px; }

/* 批量编辑弹窗 */
.batch-dialog { display: flex; flex-direction: column; gap: 8px; }
.batch-hint { margin: 0; color: var(--color-text-2); font-size: 13px; line-height: 20px; }

/* 校验弹窗：标题带红色圆叉，正文行 = 左页签名 + 右问题文案 */
.invalid-title { display: inline-flex; align-items: center; gap: 8px; }
.invalid-title-icon { color: var(--app-color-danger); font-size: 18px; }
.invalid-dialog { display: flex; flex-direction: column; gap: 12px; }
.invalid-subtitle { margin: 0; color: var(--color-text-2); font-size: 14px; line-height: 22px; }
.invalid-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.invalid-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 10px 12px; border-radius: 2px; background: var(--mt-fill-1);
}
.invalid-tab { color: var(--color-text-2); font-size: 14px; line-height: 22px; }
.invalid-text { color: var(--color-text-1); font-size: 14px; line-height: 22px; text-align: right; }

@media (max-width: 900px) {
  /* 窄屏：基本信息回落单列（两列 500px 会溢出） */
  .form-basics-grid { grid-template-columns: minmax(0, 1fr); }
  .field-row { grid-template-columns: 28px minmax(0, 1fr); }
  .field-row--head { display: none; }
  .field-column { display: none; }
  .field-row-actions { grid-column: 1 / -1; }
  .field-options { padding: 4px 12px 12px 52px; }
}
@media (max-width: 620px) {
  .form-edit-header { flex-wrap: wrap; padding-top: 8px; }
  .form-edit-actions { width: 100%; margin-left: 0; padding-bottom: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .form-edit-header { transition: none; }
}
</style>

<style src="../styles/version-page.css"></style>
