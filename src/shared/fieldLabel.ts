/**
 * 编辑态字段标签的右侧冒号（DESIGN.md · Form field layout，2026-11-06 用户裁决）。
 *
 * 适用范围：添加 / 编辑抽屉、弹窗，以及页面级编辑 / 配置 / 填写表单里的字段标签。
 * 不适用：列表筛选条的条件标签、只读详情（.app-detail-list）标签、表格表头，
 *         以及复选框 / 开关 / 单选的选项文字。
 *
 * 冒号形态跟随界面语言：zh-CN 全角「：」，en-US 半角「:」。
 * src/app/stores/locale.ts 的 apply() 先同步 document.documentElement.lang，
 * Vue 的响应式刷新在其后的微任务中执行，因此模板里读到的总是最新语言。
 *
 * 实现分工：
 *  - Arco <a-form-item> 用本文件的 fieldLabel() 生成 label 文案。Arco 的
 *    FormItemLabel 在标签尾部固定渲染一个空白文本节点，若直接给
 *    .arco-form-item-label 加 ::after，会显示成「字段名 ：」多出一段空隙，
 *    且该空隙无法用 CSS 精确消除（英文文本也会被 word-spacing 影响）。
 *  - 手写 <label> / 字段文本 <span> 用 global.css 的 .app-field-label 类，
 *    由 ::after 追加冒号，同样按 html[lang] 自适应，且不存在 Arco 尾部空白。
 */
/** 给字段标签文案追加右侧冒号，用于 :label="fieldLabel(t('...'))" 或模板插值。 */
export function fieldLabel(text: string): string {
  const colon = typeof document !== 'undefined' && document.documentElement.lang === 'en-US' ? ':' : '：';
  return `${text}${colon}`;
}
