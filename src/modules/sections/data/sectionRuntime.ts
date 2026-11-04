/**
 * 填写分区「运行时字段」解析（2026-11-01 接线）。
 *
 * 背景：分区字段原先只存在于两个互不相干的副本——`sectionCatalog`（判定/着色/问卷第 4 步消费）
 * 与 `sectionForms`（分区管理的表单设计与版本）。规则映射（`sectionAssignments`）只能指向
 * 目录里的字段位，管理端在表单设计里新增/改名/调序的字段无法成为映射端点，两边会漂移。
 *
 * 本模块让「已发布的分区表单」成为分区字段的运行时真值源：
 * - 字段标识 = `SectionFormField.id`；预置字段即工作簿字段位字母（C/D/E…），
 *   因此既有填写值（按字母键存储）与规则映射键（`${section}:${字母}`）零迁移；
 * - 表单没有该分区行、未发布或已停用时回退 `sectionCatalog`（目录降级为种子数据与兜底）；
 * - 主数据占位（功能编号 / 功能名称，`locked`）不进填写区，由问卷封面携带。
 *
 * 渲染口径：字段位在目录里有同名项时，控件类型/提示/长度等**沿用目录**（预置表单的管理端
 * 类型只是声明，不改变既有填写交互）；纯新增字段按表单类型映射（text→单行、textarea→多行、
 * radio/checkbox→下拉），选项取表单里配置的文案。
 */
import {
  catalogField, fieldsOf, type CatalogField, type FieldKind, type SectionKey,
} from './sectionCatalog';
import { isFormEnabled, sectionForms, type SectionForm, type SectionFormField } from './sectionForms';

/** 表单字段类型 → 目录控件类型（单选/复选均落到下拉；复选的多值口径待接入后端再定） */
const TYPE_TO_KIND: Record<SectionFormField['type'], FieldKind> = {
  text: 'text', textarea: 'long', radio: 'select', checkbox: 'select',
};

/** 该分区当前生效的「已发布且启用」表单；没有则 null（调用方回退字段目录） */
export function publishedFormOf(section: SectionKey): SectionForm | null {
  return sectionForms.find((form) => form.sectionKey === section && form.status === 'published' && isFormEnabled(form)) ?? null;
}

/** 表单字段 → 目录字段视图：目录有同名项时沿用其类型/提示/口径标记 */
function toCatalogField(section: SectionKey, field: SectionFormField): CatalogField {
  const base = field.id ? catalogField(section, field.id) : undefined;
  return {
    section,
    code: field.id ?? field.name,
    labelZh: field.name,
    labelEn: base?.labelEn ?? field.name,
    kind: base?.kind ?? TYPE_TO_KIND[field.type],
    drivers: field.drivers ? [...field.drivers] : [...(base?.drivers ?? [])],
    // 主数据占位不参与填写：已在调用侧过滤；目录标记 carried=false 的字段仍只作口径展示
    carried: base ? base.carried : true,
    hintZh: base?.hintZh,
    hintEn: base?.hintEn,
    alwaysCounted: base?.alwaysCounted,
    optional: base?.optional,
    maxLength: base?.maxLength,
    formOptions: field.options.length ? [...field.options] : undefined,
  };
}

/** 分区运行时字段（顺序 = 表单设计里的字段顺序，已排除主数据占位） */
export function runtimeFieldsOf(section: SectionKey): CatalogField[] {
  const form = publishedFormOf(section);
  if (!form) return fieldsOf(section);
  return form.fields
    .filter((field) => !field.locked)
    .map((field) => toCatalogField(section, field));
}
