/**
 * 导出网关（对接接口预留）。
 *
 * 裁决（2026-10-26 用户）：条目库/标准条文允许导出；**权限由天衡角色管理统一控制，
 * 水印由天衡统一设置**，本系统不自建权限与水印实现。
 *
 * 因此这里只定义契约，不做鉴权与加水印：
 * - `authorize()` 由统一权限中心返回「是否放行 + 水印参数 + 有效期」；
 * - `deliver()` 由文件服务返回可下载地址（水印在服务端渲染时叠加，前端不处理）。
 *
 * 当前 `localPreviewExportGateway` 为本地预览实现：始终放行、无水印、直接生成 Blob，
 * 仅在页面上提示「待接入统一策略」。接入时调用 `setExportGateway()` 替换即可，
 * 页面代码不需要改动。
 */

export type ExportModule = 'standard' | 'clause' | 'survey' | 'coverage';

export type ExportFormat = 'md' | 'xlsx' | 'pdf';

export interface ExportRequest {
  /** 导出对象所属模块 */
  module: ExportModule;
  /** 导出范围的人类可读描述（如「第6章」「全部章节」），仅用于审计与水印 */
  scope: string;
  format: ExportFormat;
  /** 记录标识（条文号 / 问卷号），供权限中心做数据级判定 */
  recordIds?: string[];
}

export interface WatermarkPolicy {
  enabled: boolean;
  /** 水印文案（通常为「企业名 + 用户 + 时间」，由权限中心拼装） */
  text: string;
  opacity: number;
  position: 'diagonal' | 'footer';
}

export interface ExportGrant {
  allowed: boolean;
  /** 拒绝原因（i18n key 或后端文案，页面直接展示） */
  reason?: string;
  /** null = 无水印 */
  watermark: WatermarkPolicy | null;
  /** 授权有效期（ISO 时间），过期需重新申请 */
  expiresAt?: string;
}

export interface ExportPayload {
  fileName: string;
  blob: Blob;
  contentType: string;
}

export interface ExportDelivery {
  url: string;
  fileName: string;
}

export interface ExportGateway {
  authorize(request: ExportRequest): Promise<ExportGrant>;
  deliver(request: ExportRequest, payload: ExportPayload): Promise<ExportDelivery>;
}

/** 本地预览实现：不鉴权、无水印、即时下载（不得用于生产） */
export const localPreviewExportGateway: ExportGateway = {
  async authorize() {
    return { allowed: true, watermark: null };
  },
  async deliver(_request, payload) {
    const url = URL.createObjectURL(payload.blob);
    return { url, fileName: payload.fileName };
  },
};

let current: ExportGateway = localPreviewExportGateway;

/** 接入天衡统一权限/水印服务时替换实现 */
export function setExportGateway(next: ExportGateway): void {
  current = next;
}

export function getExportGateway(): ExportGateway {
  return current;
}

/** 页面统一出口：授权 → 交付 → 触发浏览器下载；返回 false 表示被拒 */
export async function runExport(request: ExportRequest, payload: ExportPayload): Promise<{ ok: boolean; reason?: string }> {
  const grant = await current.authorize(request);
  if (!grant.allowed) return { ok: false, reason: grant.reason };
  const delivery = await current.deliver(request, payload);
  const link = document.createElement('a');
  link.href = delivery.url;
  link.download = delivery.fileName;
  link.click();
  if (delivery.url.startsWith('blob:')) URL.revokeObjectURL(delivery.url);
  return { ok: true };
}
