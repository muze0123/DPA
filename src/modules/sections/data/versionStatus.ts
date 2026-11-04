/**
 * 分区表单版本 · 共享状态口径与版本列表列定义（2026-10-28 全分区统一）。
 *
 * 状态口径（结合业务需求裁定，替代历史口径「工作簿参考 / 本机草稿 / 初始版本 /
 * 参考版本 / 已启用」）：
 * - current   现行版本：分区当前生效的字段结构基线，可「基于此新建」；
 * - draft     草稿：本机保存、尚未发布的版本，可编辑；
 * - published 已发布：发布服务接入后锁定生效的版本（预留态，当前流程不可达）；
 * - retired   历史版本：被新发布版本替代的旧版本（预留态，当前流程不可达）。
 *
 * 发布服务未接入（basicInfoGateway / anonymizationGateway 的 publishVersion 一律
 * 抛 service-unavailable），published / retired 仅存在于类型与筛选选项中，不出现在
 * 当前数据里；持久化的版本草稿状态恒为 'draft'，历史字面量无需迁移。
 */

/** 分区表单版本状态（七个分区同一类型） */
export type SectionVersionStatus = 'current' | 'draft' | 'published' | 'retired';

/** 状态全集（筛选下拉与遍历顺序以此为准） */
export const SECTION_VERSION_STATUSES: readonly SectionVersionStatus[] = ['current', 'draft', 'published', 'retired'];

/**
 * 历史口径归一：'reference'（工作簿参考/初始版本/参考版本）、'active'（已启用）
 * 及任何未知值都并入 current；'draft' / 'published' / 'retired' 原样保留。
 */
export function normalizeSectionVersionStatus(value: unknown): SectionVersionStatus {
  if (value === 'draft' || value === 'published' || value === 'retired') return value;
  return 'current';
}

/** 状态标签文案：sectionVersion.status.<status>（zh/en 对称，见 src/app/i18n.ts） */
export function sectionVersionStatusText(status: SectionVersionStatus): string {
  return `sectionVersion.status.${status}`;
}

/** 状态标签颜色（Arco 语义色）：现行/已发布绿、草稿蓝、历史灰 */
export function sectionVersionStatusColor(status: SectionVersionStatus): string {
  if (status === 'draft') return 'arcoblue';
  if (status === 'retired') return 'gray';
  return 'green';
}

/**
 * 「来源版本」列展示值：空串或工作簿文件名（.xlsx/.xls，大小写不敏感）视为
 * 无来源（2026-10-27 口径），列表统一显示占位符，不出现工作簿文件名。
 */
export function sectionVersionSourceDisplay(sourceVersion: string | undefined): string {
  const source = (sourceVersion ?? '').trim();
  if (!source || /\.xlsx?$/i.test(source)) return '—';
  return source;
}
