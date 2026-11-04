import { useI18n } from 'vue-i18n';
import type { AuditActionType, AuditModuleKey, AuditRole, AuditResult } from './data/audit';

/**
 * 审计模块的枚举渲染。
 *
 * 与 surveys/labels.ts 同一约定：key 用模板串写死前缀，`scripts/i18n.mjs`
 * 才能把它识别成 `audit.actionTypes.<code>` 这样的动态 key 模式。
 * 字典缺项时返回 code 本身，而不是 key 路径。
 */

/** 动作类型 → Arco 语义色（DESIGN.md 语义层）：查看/登录中性、新建成功、修改警告、删除危险、导入导出信息、审核/授权/配置专属色。 */
export const auditActionColors: Record<AuditActionType, string> = {
  login: 'gray',
  view: 'gray',
  create: 'green',
  update: 'orange',
  delete: 'red',
  import: 'arcoblue',
  export: 'arcoblue',
  review: 'purple',
  grant: 'cyan',
  config: 'gold',
};

export function auditActionColor(actionType: AuditActionType): string {
  return auditActionColors[actionType] ?? 'gray';
}

export function useAuditLabels() {
  const { t, te } = useI18n({ useScope: 'global' });

  function label(prefix: string, code: string): string {
    const key = `${prefix}.${code}`;
    return te(key) ? t(key) : code;
  }

  return {
    actionLabel: (code: AuditActionType) => label('audit.actionTypes', code),
    moduleLabel: (code: AuditModuleKey) => label('audit.modules', code),
    roleLabel: (code: AuditRole) => label('audit.roles', code),
    resultLabel: (code: AuditResult) => label('audit.results', code),
  };
}
