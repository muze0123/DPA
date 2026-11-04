import type { TableColumnData } from '@arco-design/web-vue';

/**
 * 分区「表单版本」列表统一列定义（2026-10-28 裁决）。
 *
 * 七个分区（基础信息 / 告知与同意 / 数据传输 / 传感器 / 生物特征与口令 / 匿名化 /
 * 通用材料）的字段、顺序、列宽完全一致；各页面通过 slot 渲染版本号（可点）、
 * 状态（共享状态口径见 versionStatus.ts）、来源版本（工作簿文件名视为无来源）、
 * 分区说明（单行省略）、更新时间（yyyy-MM-dd HH:mm）与操作列。
 */
export function sectionVersionColumns(t: (key: string) => string): TableColumnData[] {
  return [
    { title: t('sectionVersion.columns.version'), dataIndex: 'version', slotName: 'version', width: 120 },
    { title: t('sectionVersion.columns.status'), dataIndex: 'status', slotName: 'status', width: 125 },
    { title: t('sectionVersion.columns.fields'), dataIndex: 'fields', slotName: 'fields', width: 110 },
    { title: t('sectionVersion.columns.source'), dataIndex: 'sourceVersion', slotName: 'source', width: 140 },
    { title: t('sectionVersion.columns.description'), dataIndex: 'description', slotName: 'description', width: 220 },
    { title: t('sectionVersion.columns.updated'), dataIndex: 'updatedAt', slotName: 'updatedAt', width: 165 },
    { title: t('sectionVersion.columns.actions'), dataIndex: 'actions', slotName: 'actions', width: 220, fixed: 'right' },
  ];
}

/** 统一列宽合计（120+125+110+140+220+165+220），a-table 的 scroll.x 取该值 */
export const SECTION_VERSION_TABLE_WIDTH = 1100;

/** 更新时间列展示：yyyy-MM-dd HH:mm，空值显示 — */
export function sectionVersionTimeDisplay(updatedAt: string | undefined): string {
  return updatedAt ? updatedAt.slice(0, 16).replace('T', ' ') : '—';
}
