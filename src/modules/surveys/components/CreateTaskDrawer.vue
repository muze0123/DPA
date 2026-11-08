<script setup lang="ts">
/**
 * 新建任务抽屉（2026-10-30 用户裁决，原型交互）：
 * 任务名称（必填 ≤50，全局唯一）/ 任务描述（≤200）/ 优先级单选（默认中）/
 * 截止时间（到日）/ 附件（≤5 个、单文件 ≤20MB、Word/Excel/PDF/PNG/JPEG）/
 * 任务编排（必选，选中后展示缩略流程预览 + 编辑编排入口）。
 * 确定 → 任务进入列表且状态为待处理；取消 → 关闭抽屉不保存。
 * copySource（2026-11-02 恢复「复制」）：以既有任务为模板预填字段，名称加「（副本）」，
 * 唯一性仍由校验兜底；编排未配置的源任务保持为空，由用户必选。
 */
import { computed, reactive, ref, watch } from 'vue';
import { Message, type FileItem } from '@arco-design/web-vue';
import { IconEdit } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { createTask, MOCK_CURRENT_USER, surveyRecords, TASK_ORCHESTRATIONS, type SurveyRecord, type TaskPriority } from '../data/surveys';

const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: []; editOrchestration: [orchestrationId: string] }>();
/** 复制源（2026-11-02 用户裁决恢复「复制」）：行内复制按任务字段预填本抽屉，名称加「（副本）」后缀 */
const props = withDefaults(defineProps<{ copySource?: SurveyRecord | null }>(), { copySource: null });
const { t } = useI18n({ useScope: 'global' });

const saving = ref(false);
const formRef = ref<{ validate: () => Promise<unknown>; scrollToField: (field: string) => void } | null>(null);
const form = reactive({
  taskName: '', taskDescription: '', priority: 'medium' as TaskPriority, deadline: '', orchestrationId: '',
});
const initial = ref('');
const dirty = computed(() => JSON.stringify({ ...form }) !== initial.value);

/** 附件：仅保留文件名与大小（mock 不落真实文件），上限 5 个、单文件 20MB */
const MAX_FILES = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['.doc', '.docx', '.xls', '.xlsx', '.pdf', '.png', '.jpg', '.jpeg'];
const fileItems = ref<FileItem[]>([]);

const orchestrationOptions = computed(() => TASK_ORCHESTRATIONS.map((item) => ({ value: item.id, label: item.name })));
const selectedOrchestration = computed(() => TASK_ORCHESTRATIONS.find((item) => item.id === form.orchestrationId) ?? null);

const rules = computed(() => ({
  taskName: [
    { required: true, message: t('surveys.taskCreate.nameRequired') },
    {
      validator: (_value: string, callback: (error?: string) => void) => {
        const name = form.taskName.trim();
        if (name && surveyRecords.some((record) => record.taskName === name)) callback(t('surveys.taskCreate.nameDuplicated'));
        else callback();
      },
    },
  ],
  orchestrationId: [{ required: true, message: t('surveys.taskCreate.orchestrationRequired') }],
}));

/** 复制源的附件尺寸：FileItem 不携带 size，旁路记录供落库时回填 */
const copiedSizes = ref<Map<string, number>>(new Map());

function resetForm() {
  const src = props.copySource;
  form.taskName = src ? `${src.taskName}（副本）` : '';
  form.taskDescription = src?.taskDescription ?? '';
  form.priority = src?.priority ?? 'medium';
  form.deadline = src?.deadline ?? '';
  form.orchestrationId = src?.orchestrationId ?? '';
  copiedSizes.value = new Map();
  fileItems.value = (src?.attachments ?? []).map((item, index) => {
    const uid = `copy-${index}`;
    copiedSizes.value.set(uid, item.size);
    return { uid, name: item.name } as FileItem;
  });
  initial.value = JSON.stringify({ ...form });
}

watch(visible, (open) => { if (open) resetForm(); });

function onFilesChange(fileList: FileItem[]) {
  if (fileList.length > MAX_FILES) {
    Message.warning(t('surveys.taskCreate.tooManyFiles', { count: MAX_FILES }));
    return;
  }
  const accepted: FileItem[] = [];
  for (const file of fileList) {
    const name = file.file?.name ?? file.name ?? '';
    const size = file.file?.size ?? 0;
    const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
    if (extension && !ACCEPTED_EXTENSIONS.includes(extension)) {
      Message.error(t('surveys.taskCreate.fileTypeUnsupported', { name }));
      continue;
    }
    if (size > MAX_FILE_SIZE) {
      Message.error(t('surveys.taskCreate.fileTooLarge', { name }));
      continue;
    }
    accepted.push(file);
  }
  fileItems.value = accepted;
}

function removeFile(uid: string | number) {
  fileItems.value = fileItems.value.filter((item) => item.uid !== uid);
}

/**
 * 编辑编排：跳转天枢系统平台「任务编排」编辑页。
 * 预留接口（对接时替换）：openTianshuOrchestrationEditor(orchestrationId)
 * —— 平台侧提供路由/微前端入口后在此调用（如 window.open 或 microApp 跳转），
 *    编辑保存后编排数据回显本抽屉。当前仅触发 edit-orchestration 事件并给出引导提示。
 */
function editOrchestration() {
  if (!form.orchestrationId) return;
  emit('editOrchestration', form.orchestrationId);
  Message.info(t('surveys.taskCreate.orchestrationTodo'));
}

async function confirmCreate() {
  if (saving.value) return;
  const errors = await formRef.value?.validate();
  if (errors) {
    formRef.value?.scrollToField(Object.keys(errors as Record<string, unknown>)[0]);
    return;
  }
  saving.value = true;
  try {
    await createTask({
      taskName: form.taskName.trim(),
      ...(form.taskDescription.trim() ? { taskDescription: form.taskDescription.trim() } : {}),
      priority: form.priority,
      ...(form.deadline ? { deadline: form.deadline } : {}),
      orchestrationId: form.orchestrationId,
      ...(fileItems.value.length ? {
        attachments: fileItems.value.map((item) => ({
          name: item.file?.name ?? item.name ?? '',
          size: item.file?.size ?? copiedSizes.value.get(String(item.uid)) ?? 0,
        })),
      } : {}),
    });
    Message.success(t('surveys.taskCreate.success', { user: MOCK_CURRENT_USER.name }));
    emit('created');
    visible.value = false;
  } finally {
    saving.value = false;
  }
}

function cancelCreate() {
  if (saving.value) return;
  if (dirty.value && !window.confirm(t('surveys.taskCreate.unsaved'))) return;
  visible.value = false;
}
</script>

<template>
  <a-drawer
    v-model:visible="visible"
    width="min(800px, 100vw)"
    unmount-on-close
    :mask-closable="!saving && !dirty"
    :header="true"
    :footer="true"
    class="task-create-drawer ledger-drawer"
  >
    <template #title>{{ t('surveys.taskCreate.title') }}</template>

    <a-form ref="formRef" :model="form" :rules="rules" layout="vertical" class="task-create-form">
      <!-- 区块A 基本信息（DESIGN.md · Drawer：业务抽屉按白卡分区块，画布 --mt-fill-1） -->
      <div class="task-drawer-group">
        <h2 class="task-section-heading">{{ t('surveys.taskCreate.sectionBasics') }}</h2>
        <a-form-item field="taskName" required>
          <template #label><span class="task-field-label app-field-label">{{ t('surveys.taskCreate.name') }}</span></template>
          <a-input
            v-model="form.taskName"
            :max-length="50"
            :placeholder="t('surveys.taskCreate.namePlaceholder')"
            :show-word-limit="true"
          />
        </a-form-item>

        <a-form-item field="taskDescription">
          <template #label><span class="task-field-label app-field-label">{{ t('surveys.taskCreate.description') }}</span></template>
          <a-textarea
            v-model="form.taskDescription"
            :max-length="200"
            :placeholder="t('surveys.taskCreate.namePlaceholder')"
            :auto-size="{ minRows: 3, maxRows: 6 }"
            :show-word-limit="true"
          />
        </a-form-item>

        <a-form-item field="priority" required>
          <template #label><span class="task-field-label app-field-label">{{ t('surveys.taskCreate.priority') }}</span></template>
          <a-radio-group v-model="form.priority">
            <a-radio value="low">{{ t('surveys.priorities.low') }}</a-radio>
            <a-radio value="medium">{{ t('surveys.priorities.medium') }}</a-radio>
            <a-radio value="high">{{ t('surveys.priorities.high') }}</a-radio>
            <a-radio value="urgent">{{ t('surveys.priorities.urgent') }}</a-radio>
          </a-radio-group>
        </a-form-item>

        <a-form-item field="deadline">
          <template #label><span class="task-field-label app-field-label">{{ t('surveys.taskCreate.deadline') }}</span></template>
          <a-date-picker
            v-model="form.deadline"
            value-format="YYYY-MM-DD"
            :placeholder="t('surveys.taskCreate.deadlinePlaceholder')"
            class="task-deadline-picker"
          />
        </a-form-item>

        <a-form-item field="attachments">
          <template #label><span class="task-field-label app-field-label">{{ t('surveys.taskCreate.attachments') }}</span></template>
          <div class="task-upload">
            <a-upload
              draggable
              :auto-upload="false"
              :limit="MAX_FILES"
              :file-list="fileItems"
              :show-file-list="false"
              :show-upload-button="true"
              accept=".doc,.docx,.xls,.xlsx,.pdf,.png,.jpg,.jpeg"
              @change="onFilesChange"
            >
              <template #upload-button>
                <div class="task-upload-area">
                  <span class="task-upload-plus" aria-hidden="true">+</span>
                  <p class="task-upload-hint">{{ t('surveys.taskCreate.uploadHint') }}</p>
                  <p class="task-upload-meta">{{ t('surveys.taskCreate.uploadMeta') }}</p>
                </div>
              </template>
            </a-upload>
            <!-- 已传文件行：名称 + 删除（mock 不保存真实文件） -->
            <ul v-if="fileItems.length" class="task-file-list">
              <li v-for="file in fileItems" :key="file.uid" class="task-file-row">
                <span class="task-file-name" :title="file.file?.name ?? file.name">{{ file.file?.name ?? file.name }}</span>
                <button class="task-file-remove" type="button" :aria-label="t('surveys.taskCreate.removeFile')" @click="removeFile(file.uid)">×</button>
              </li>
            </ul>
          </div>
        </a-form-item>
      </div>

      <!-- 区块B 任务编排：选择后按所选编排的审批流程节点展示缩略预览 -->
      <div class="task-drawer-group">
        <h2 class="task-section-heading">{{ t('surveys.taskCreate.sectionOrchestration') }}</h2>
        <a-form-item field="orchestrationId" required hide-label class="task-orchestration-item">
          <a-select
            v-model="form.orchestrationId"
            :placeholder="t('surveys.taskCreate.orchestrationPlaceholder')"
            :options="orchestrationOptions"
            allow-clear
          />
          <!-- 缩略流程预览：节点卡片（头部=节点名，主体=审批人说明），审核节点橙色强调，节点间竖向连接线 -->
          <div v-if="selectedOrchestration" class="task-flow">
            <div class="task-flow-nodes">
              <template v-for="(node, index) in selectedOrchestration.nodes" :key="index">
                <div v-if="index > 0" class="task-flow-connector" aria-hidden="true"></div>
                <div class="task-flow-node" :class="`is-${node.kind}`">
                  <p class="task-flow-header">{{ node.label }}</p>
                  <p class="task-flow-detail">{{ node.detail }}</p>
                </div>
              </template>
            </div>
            <!-- 编辑编排：跳转天枢平台「任务编排」编辑页（事件触发 + 预留接口，见 editOrchestration） -->
            <button class="task-flow-edit" type="button" @click="editOrchestration">
              <IconEdit :size="14" aria-hidden="true" />
              <span>{{ t('surveys.taskCreate.editOrchestration') }}</span>
            </button>
          </div>
        </a-form-item>
      </div>
    </a-form>

    <template #footer>
      <div class="task-create-footer">
        <a-button class="app-btn-neutral" :disabled="saving" @click="cancelCreate">{{ t('surveys.taskCreate.cancel') }}</a-button>
        <a-button type="primary" :loading="saving" @click="confirmCreate">{{ t('surveys.taskCreate.confirm') }}</a-button>
      </div>
    </template>
  </a-drawer>
</template>

<style scoped>
/* 抽屉画布统一灰底、头尾白底（DESIGN.md · Drawer，表面样式复用 global.css .ledger-drawer） */
.task-field-label { color: var(--color-text-1); }

/* 业务抽屉分区块：白卡 + 2px 圆角，区块间 16px（由 ledger-drawer body 的 gap 提供） */
.task-create-form { display: flex; flex-direction: column; gap: 16px; }
.task-create-form :deep(.arco-form-item) { margin-bottom: 0; }
.task-drawer-group { display: flex; flex-direction: column; gap: 16px; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.task-section-heading { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
/* 截止时间日期选择器：随表单拉伸整宽，与名称/描述等控件对齐（Arco 默认定宽；
   Arco 根元素不带本组件 scoped 属性，需从白卡容器 :deep 穿透） */
.task-drawer-group :deep(.task-deadline-picker) { width: 100%; }

/* 上传虚线区 + 已传文件行 */
.task-upload { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.task-upload :deep(.arco-upload) { width: 100%; }
.task-upload-area { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; padding: 20px 16px; border: 1px dashed var(--app-control-border); border-radius: 4px; background: var(--app-surface); color: var(--color-text-3); cursor: pointer; }
.task-upload-area:hover { border-color: var(--app-accent); color: var(--app-accent); }
.task-upload-plus { font-size: 20px; line-height: 24px; }
.task-upload-hint { margin: 0; color: var(--color-text-2); font-size: 14px; line-height: 22px; }
.task-upload-meta { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.task-upload :deep(.arco-upload-tip) { display: none; }

.task-file-list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.task-file-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; padding: 0 12px; border-radius: 2px; background: var(--color-fill-1); }
.task-file-name { overflow: hidden; color: var(--color-text-1); font-size: 14px; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.task-file-remove { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 2px; color: var(--color-text-3); background: transparent; cursor: pointer; font-size: 16px; }
.task-file-remove:hover { color: rgb(var(--danger-6)); background: var(--color-fill-2); }

/* 缩略流程预览：节点卡片（头部=节点名浅蓝底，主体=审批人说明白底），
   审核节点橙色头部 + 橙色描边强调；节点间竖向连接线；底部「编辑编排」整宽入口 */
.task-flow { display: flex; flex-direction: column; gap: 12px; width: 100%; margin-top: 4px; }
.task-flow-nodes { display: flex; flex-direction: column; width: 100%; max-width: 440px; margin: 0 auto; }
.task-flow-node { overflow: hidden; border: 1px solid var(--color-primary-light-2); border-radius: 4px; background: var(--app-surface); }
.task-flow-node.is-review { border: 2px solid rgb(var(--warning-6)); }
.task-flow-header { margin: 0; padding: 6px 12px; background: var(--color-primary-light-1); color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; }
.task-flow-node.is-review .task-flow-header { background: rgb(var(--warning-6)); color: var(--app-on-accent); }
.task-flow-detail { margin: 0; padding: 8px 12px; background: var(--app-surface); color: var(--color-text-1); font-size: 14px; line-height: 22px; }
.task-flow-connector { flex: none; width: 2px; height: 16px; margin: 0 auto; background: var(--color-primary-light-2); }
.task-flow-edit { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 40px; margin-top: 4px; padding: 0 12px; border: 0; border-radius: 2px; color: var(--color-text-2); background: var(--color-fill-1); cursor: pointer; font: inherit; font-size: 14px; line-height: 22px; }
.task-flow-edit:hover { color: var(--app-accent); background: var(--color-fill-2); }

.task-create-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.task-orchestration-item :deep(.arco-form-item-content) { flex-direction: column; align-items: stretch; }
</style>
