import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  createDownloadTaskRecords,
  createImportTaskRecords,
  type DownloadTaskRecord,
  type ImportTaskRecord,
  type TaskKind,
} from '../data/taskCenter';

/** 关闭弹层后记住本次最后访问的 Tab（会话内有效，刷新页面后重置） */
const LAST_TAB_STORAGE_KEY = 'task-center:last-tab';

/**
 * 任务中心全局状态：
 * - 数据为模块级 Mock（无后端契约），轮询/终态转换在 tick() 内模拟
 * - 顶栏角标读取 processingCount；导入/导出操作的 Toast「点击查看」可调用 open(tab)
 */
export const useTaskCenterStore = defineStore('task-center', () => {
  const importTasks = ref<ImportTaskRecord[]>(createImportTaskRecords());
  const downloadTasks = ref<DownloadTaskRecord[]>(createDownloadTaskRecords());
  const visible = ref(false);
  const activeTab = ref<TaskKind>('import');

  const processingCount = computed(
    () =>
      importTasks.value.filter((task) => task.status === 'processing').length +
      downloadTasks.value.filter((task) => task.status === 'processing').length,
  );

  function open(tab?: TaskKind) {
    if (tab) {
      activeTab.value = tab;
    } else {
      const saved = sessionStorage.getItem(LAST_TAB_STORAGE_KEY);
      activeTab.value = saved === 'download' ? 'download' : 'import';
    }
    visible.value = true;
  }

  function close() {
    visible.value = false;
    sessionStorage.setItem(LAST_TAB_STORAGE_KEY, activeTab.value);
  }

  function switchTab(tab: TaskKind) {
    if (activeTab.value === tab) return;
    activeTab.value = tab;
    sessionStorage.setItem(LAST_TAB_STORAGE_KEY, tab);
  }

  /** 业务页新增导入任务（功能台账批量导入），新任务置顶展示 */
  function addImportTask(record: ImportTaskRecord) {
    importTasks.value = [record, ...importTasks.value];
  }

  /** 业务页新增下载任务（功能台账批量导出），新任务置顶展示 */
  function addDownloadTask(record: DownloadTaskRecord) {
    downloadTasks.value = [record, ...downloadTasks.value];
  }

  /**
   * 处理中任务每 10 秒轮询一次，仅推进 processing 行并更新进度百分比；
   * 完成后自动转为对应终态。轮询请求失败静默跳过（Mock 恒成功）。
   * 业务页创建的任务已带预设总数/失败数，终态汇总保留这些预设值。
   */
  function tick() {
    const advance = (progress: number | undefined) => Math.min(100, (progress ?? 0) + 8 + Math.floor(Math.random() * 10));
    for (const task of importTasks.value) {
      if (task.status !== 'processing') continue;
      const progress = advance(task.progress);
      task.progress = progress;
      if (progress >= 100) {
        // 有预设失败数（业务页导入含错误行）按部分失败收口，保留「下载错误数据」入口
        task.status = (task.fail ?? 0) > 0 ? 'partial_fail' : 'success';
        task.total = task.total ?? 40;
        task.fail = task.fail ?? 0;
        task.ok = (task.total ?? 0) - (task.fail ?? 0);
      }
    }
    for (const task of downloadTasks.value) {
      if (task.status !== 'processing') continue;
      const progress = advance(task.progress);
      task.progress = progress;
      if (progress >= 100) task.status = 'success';
    }
  }

  return {
    importTasks,
    downloadTasks,
    visible,
    activeTab,
    processingCount,
    open,
    close,
    switchTab,
    addImportTask,
    addDownloadTask,
    tick,
  };
});
