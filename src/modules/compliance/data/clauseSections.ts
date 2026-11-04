import type { SectionKey } from '../../sections/data/sectionCatalog';

/**
 * 条款 → 填写分区映射（2026-10-27 新增，用于判定规则页展示「填写分区」列）。
 *
 * 真值源：GB44464_静态.xlsx「需求筛选」!A77:C114（v87 静态版：条款号 / 填写分区 / 字段位），
 * 与 PDF 草案「需求筛选」表的 F 列「填写分区」一致；字段位字母即该分区内的工作簿列位
 * （E2 = 基础信息分区的 E 列第 2 行）。一份条款只对应一个分区、一个字段位，
 * 因此「填写分区」是条款级属性，不随安全需求条目细分。
 */
export interface ClauseSectionRef {
  /** 填写分区（与填写分区模块的 6 个条款驱动分区同键） */
  section: SectionKey;
  /** 分区内字段位（工作簿列位字母 + 行号） */
  field: string;
}

/** 38 条款的分区归属：分区顺序与填写分区页签一致（基础信息 → 匿名化） */
export const CLAUSE_SECTIONS: Readonly<Record<string, ClauseSectionRef>> = {
  /* 基础信息 */
  '6.1.1': { section: 'basicInfo', field: 'E2' },
  '6.1.6': { section: 'basicInfo', field: 'H2' },
  '6.3.1': { section: 'basicInfo', field: 'F2' },
  '6.3.5': { section: 'basicInfo', field: 'E2' },
  '6.3.6': { section: 'basicInfo', field: 'D2' },
  '6.3.7': { section: 'basicInfo', field: 'E2' },
  '6.4.1': { section: 'basicInfo', field: 'J2' },
  '6.4.2': { section: 'basicInfo', field: 'I2' },
  /* 告知与同意 */
  '6.1.2': { section: 'consent', field: 'C3' },
  '6.1.3': { section: 'consent', field: 'C3' },
  '6.1.4': { section: 'consent', field: 'V3' },
  '6.1.5': { section: 'consent', field: 'T3' },
  '6.2.1.1': { section: 'consent', field: 'E3' },
  '6.2.2': { section: 'consent', field: 'O3' },
  '6.2.3': { section: 'consent', field: 'D3' },
  '6.2.4.1': { section: 'consent', field: 'F3' },
  '6.2.4.2': { section: 'consent', field: 'E3' },
  '6.2.5.1': { section: 'consent', field: 'G3' },
  '6.2.5.2': { section: 'consent', field: 'G3' },
  '6.7.1': { section: 'consent', field: 'L3' },
  '6.7.2': { section: 'consent', field: 'M3' },
  '6.7.3': { section: 'consent', field: 'N3' },
  '6.7.4': { section: 'consent', field: 'L3' },
  /* 数据传输 */
  '6.2.1.2': { section: 'transmission', field: 'F3' },
  '6.6.1.1': { section: 'transmission', field: 'C3' },
  '6.6.1.2': { section: 'transmission', field: 'C3' },
  '6.8': { section: 'transmission', field: 'D3' },
  /* 传感器 */
  '6.3.2': { section: 'sensors', field: 'C3' },
  '6.3.3': { section: 'sensors', field: 'D3' },
  '6.3.4': { section: 'sensors', field: 'D3' },
  /* 生物特征与口令 */
  '6.4.3': { section: 'biometric', field: 'C3' },
  '6.5.1': { section: 'biometric', field: 'D3' },
  '6.5.2': { section: 'biometric', field: 'F3' },
  /* 匿名化 */
  '6.6.1.3': { section: 'anonymization', field: 'C3' },
  '6.6.2.1.1': { section: 'anonymization', field: 'E3' },
  '6.6.2.1.2': { section: 'anonymization', field: 'E3' },
  '6.6.2.2.1': { section: 'anonymization', field: 'F3' },
  '6.6.2.2.2': { section: 'anonymization', field: 'G3' },
};

/** 表格中的分区列顺序（与填写分区页签一致） */
export const CLAUSE_SECTION_ORDER: readonly SectionKey[] = [
  'basicInfo', 'consent', 'transmission', 'sensors', 'biometric', 'anonymization',
];

export function clauseSection(code: string): ClauseSectionRef | null {
  return CLAUSE_SECTIONS[code] ?? null;
}

/** 分区筛选选项（只列确有条款归属的分区） */
export function clausesOfSection(section: SectionKey): string[] {
  return Object.entries(CLAUSE_SECTIONS).filter(([, ref]) => ref.section === section).map(([code]) => code);
}
