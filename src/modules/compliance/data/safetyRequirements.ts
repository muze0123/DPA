/**
 * 安全需求来源适配层（2026-11-01 用户裁决：聚合成一条来源）。
 *
 * 口径变更：天枢系统平台把「需求数据」工作簿 E 列的全部安全需求归集为一个来源
 * 「数据安全需求」。基本信息「安全需求」字段选择的是这条**来源**（不是具体条目）；
 * 来源选中后，条款内「需求条目」即可从该来源包含的全部单元格条目（38 条，见
 * `safetyRequirementEntries.ts`）中多选挂接。
 *
 * 天枢侧暂无接口文档，沿用 standardLibrary.ts 的适配层契约：真实接口就绪后仅替换取数实现
 * 并删去 mock 常量。引用值格式与标准库/问题库同构：'来源编号-来源名称'。
 */
export const TIANSHU_SAFETY_REQUIREMENTS = { endpoint: '/tianshu/api/v1/safety-requirements', useMock: true } as const;

/** 聚合来源引用值：'安全需求编号-安全需求名称' */
export const SAFETY_REQUIREMENT_SOURCE = 'SR-000-数据安全需求';

/** 基本信息「安全需求」字段候选：聚合来源单条（2026-11-01 用户裁决） */
export function safetyRequirementOptions(): string[] {
  return [SAFETY_REQUIREMENT_SOURCE];
}

/**
 * 存量引用值归一：历史规则可能存有按条目生成的 'SR-###-摘要' 或更早的 '条目号-摘要'。
 * 语义上它们都属于同一「数据安全需求」来源，故统一归一为聚合来源值；
 * 空值保持空值（未选择来源的状态必须可表达）。
 */
export function normalizeSafetyRequirementValue(value: string): string {
  if (!value) return value;
  return SAFETY_REQUIREMENT_SOURCE;
}
