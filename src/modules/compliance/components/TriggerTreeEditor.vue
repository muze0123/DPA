<script setup lang="ts">
/**
 * 触发规则问题树编辑器（递归组件，2026-11-01 用户裁决）：
 * - 一个容器 = 左侧 且/或 关系选择（≥2 个子项时显示）+ 右侧子项列表（连接线用 CSS 绘制）；
 * - 子项 = 叶子（题目行：期望答案 是/否 切换 + 题号题干，单行省略；右侧 设为子级 / 取消子级 / 删除）
 *   或 子级组（递归渲染）；
 * - 所有操作以「容器路径 + 下标」向页面冒泡，页面在 triggerTree.ts 的纯函数上做替换式更新；
 * - 「设为子级」仅当兄弟 ≥2 时可用（并入相邻项规则见 triggerTree.setChildAt）；
 * - 「取消子级」（2026-11-04）仅子级组内叶子显示（顶层叶子本就在最高层级），
 *   把该问题移回上一层级（triggerTree.unsetChildAt），与设为子级互逆。
 */
import { computed } from 'vue';
import { IconDelete } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import type { TriggerNode, TriggerOp, TriggerPath } from '../data/triggerTree';

const { t } = useI18n();

const props = defineProps<{
  op: TriggerOp;
  children: TriggerNode[];
  /** 本容器在整棵树中的路径（顶层为 []），用于向上冒泡操作位置 */
  prefix: TriggerPath;
  questionText: (code: string) => string;
  opOptions: { value: TriggerOp; label: string }[];
}>();

const emit = defineEmits<{
  (e: 'remove', path: number[]): void;
  (e: 'set-child', path: number[]): void;
  (e: 'unset-child', path: number[]): void;
  (e: 'set-op', path: number[], op: TriggerOp): void;
  (e: 'toggle-negate', path: number[]): void;
}>();

const nodeKey = (node: TriggerNode, index: number): string =>
  node.kind === 'leaf' ? `leaf-${node.code}-${index}` : `group-${index}`;

/** 本容器是否为子级组（顶层 prefix = []，组内叶子才有「取消子级」） */
const inGroup = computed(() => props.prefix.length > 0);

/** 容器自身的 且/或 关系变化（顶层 prefix = []） */
const onSelfOpChange = (value: unknown): void => {
  emit('set-op', [...props.prefix], value === 'AND' ? 'AND' : 'OR');
};
</script>

<template>
  <div class="cfg-tree" :class="{ 'has-op': children.length >= 2 }">
    <a-select
      v-if="children.length >= 2"
      class="cfg-tree-op"
      size="mini"
      :model-value="op"
      :aria-label="`${prefix.length ? '子级组' : '顶层'}逻辑关系`"
      :options="opOptions"
      :trigger-props="{ autoFitPopupMinWidth: false }"
      @change="onSelfOpChange($event)"
    />
    <ul class="cfg-tree-items">
      <li v-for="(node, index) in children" :key="nodeKey(node, index)" class="cfg-tree-node">
        <!-- 叶子：题目行 -->
        <div v-if="node.kind === 'leaf'" class="cfg-leaf">
          <!-- 期望答案：是（默认，序列化 Q1）/ 否（NOT(Q1)，用于「答否才触发」的条款） -->
          <button
            type="button"
            class="cfg-expect"
            :class="{ 'is-negative': node.negated }"
            :aria-label="node.negated ? t('compliance.versions.config.expectNo') : t('compliance.versions.config.expectYes')"
            :title="node.negated ? t('compliance.versions.config.expectNo') : t('compliance.versions.config.expectYes')"
            @click="emit('toggle-negate', [...prefix, index])"
          >{{ node.negated ? t('compliance.versions.config.answerNo') : t('compliance.versions.config.answerYes') }}</button>
          <span class="cfg-leaf-box" :title="questionText(node.code)">{{ questionText(node.code) }}</span>
          <!-- 取消子级（仅子级组内叶子）：移回上一层级；顶层叶子本就在最高层级，不显示 -->
          <button
            v-if="inGroup"
            type="button"
            class="cfg-link"
            @click="emit('unset-child', [...prefix, index])"
          >{{ t('compliance.versions.config.unsetChild') }}</button>
          <button
            type="button"
            class="cfg-link"
            :disabled="children.length < 2"
            @click="emit('set-child', [...prefix, index])"
          >{{ t('compliance.versions.config.setChild') }}</button>
          <button
            type="button"
            class="cfg-icon-btn"
            :aria-label="t('compliance.versions.delete')"
            @click="emit('remove', [...prefix, index])"
          >
            <IconDelete :size="14" />
          </button>
        </div>
        <!-- 子级组：递归渲染 -->
        <TriggerTreeEditor
          v-else
          :op="node.op"
          :children="node.children"
          :prefix="[...prefix, index]"
          :question-text="questionText"
          :op-options="opOptions"
          @remove="(path) => emit('remove', path)"
          @set-child="(path) => emit('set-child', path)"
          @unset-child="(path) => emit('unset-child', path)"
          @set-op="(path, value) => emit('set-op', path, value)"
          @toggle-negate="(path) => emit('toggle-negate', path)"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cfg-tree { display: flex; align-items: stretch; gap: 8px; min-width: 0; }
/* 且/或 关系选择：40×30 方形小控件（2026-11-01 用户裁决），文字居中、右侧保留下拉箭头。
   用 :deep 命中：a-select 的根元素不带本组件 scoped 标记，普通 scoped 选择器打不中；
   且 Arco 的 .arco-select 默认 width:100%，必须显式压回 40px。
   文字与箭头均绝对定位：文字占左侧剩余空间居中（修正「太靠左」），箭头钉在右缘 */
.cfg-tree :deep(.cfg-tree-op) { position: relative; flex: none; align-self: center; width: 40px; min-width: 40px; height: 30px; padding: 0; }
.cfg-tree :deep(.cfg-tree-op .arco-select-view-value) { position: absolute; left: 0; right: 14px; width: auto; display: block; top: 50%; transform: translateY(-50%); padding: 0; text-align: center; line-height: 28px; white-space: nowrap; overflow: hidden; }
.cfg-tree :deep(.cfg-tree-op .arco-select-view-suffix) { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); margin: 0; display: inline-flex; align-items: center; }
.cfg-tree :deep(.cfg-tree-op .arco-select-view-input) { padding: 0; }
.cfg-tree-items { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; position: relative; }
/* 连接线：左侧竖线 + 每行横向短枝（有 ≥2 个子项时才画） */
.cfg-tree.has-op .cfg-tree-items { margin-left: 10px; }
.cfg-tree.has-op .cfg-tree-items::before { content: ''; position: absolute; left: -10px; top: 20px; bottom: 20px; border-left: 1px solid var(--app-divider); }
.cfg-tree-node { position: relative; min-width: 0; }
.cfg-tree.has-op .cfg-tree-node::before { content: ''; position: absolute; left: -10px; top: 50%; width: 10px; border-top: 1px solid var(--app-divider); }

.cfg-leaf { display: flex; align-items: center; gap: 8px; min-width: 0; }
/* 期望答案切换：是（灰）/ 否（蓝），点一次切换，序列化为 NOT(Qnn) */
.cfg-expect { flex: none; min-width: 32px; height: 22px; padding: 0 6px; border: 1px solid var(--app-control-border); border-radius: 2px; background: var(--app-surface); color: var(--color-text-2); font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; }
.cfg-expect.is-negative { border-color: var(--app-accent); color: var(--app-accent); }
.cfg-expect:hover, .cfg-expect:focus-visible { border-color: var(--app-accent); }
.cfg-expect:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.cfg-leaf-box { flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid var(--app-control-border); border-radius: 2px; background: var(--app-surface); color: var(--color-text-1); font-size: 13px; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cfg-link { flex: none; padding: 0; border: 0; background: transparent; color: var(--app-accent); font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; white-space: nowrap; }
.cfg-link:hover:not(:disabled), .cfg-link:focus-visible:not(:disabled) { text-decoration: underline; }
.cfg-link:disabled { color: var(--color-text-3); cursor: not-allowed; text-decoration: none; }
.cfg-icon-btn { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 2px; background: transparent; color: rgb(var(--red-6)); cursor: pointer; }
.cfg-icon-btn:hover, .cfg-icon-btn:focus-visible { background: rgb(var(--red-1)); }
.cfg-icon-btn:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
</style>
