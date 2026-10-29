export type TranslationTable = Readonly<Record<string, string>>;

const fallbackTranslations: TranslationTable = {
  "common.name": "Name",
  "common.refresh": "Refresh",
  "common.download": "Download",
  "common.copied": "Copied",
  "webview.loading": "Loading",
  "webview.error": "Something went wrong",
  "webview.waiting": "Waiting for extension host",
  "webview.route.registered": "View: {name}",
  "webview.route.pending": "This view is ready for its domain implementation.",
  "webview.route.connect": "Connect",
  "webview.route.dbFileConnect": "Database file connection",
  "webview.route.parquet": "Parquet",
  "webview.route.sqlite": "SQLite",
  "webview.route.result": "Query result",
  "webview.route.manager": "Manager",
  "webview.route.esStatus": "Elasticsearch status",
  "webview.route.design": "Table design",
  "webview.route.erDiagram": "ER diagram",
  "webview.route.mock": "Mock data",
  "webview.route.structDiff": "Structure diff",
  "webview.route.keyView": "Redis key",
  "webview.route.lokiLog": "Loki logs",
  "webview.route.rabbitQueueView": "RabbitMQ queue",
  "webview.route.forward": "Port forwarding",
  "webview.route.xterm": "Terminal",
  "webview.route.sshTerminal": "SSH terminal",
  "webview.route.fileManager": "Remote file manager",
  "webview.route.sshStatus": "SSH status",
  "webview.route.sshMonitor": "SSH monitor",
  "webview.route.center": "Center",
  "webview.route.document": "Documents",
  "webview.route.plan": "Plan",
  "webview.route.console": "Settings",
  "webview.route.util": "Utilities",
  "webview.route.image": "Image",
  "esStatus.node": "Node",
  "esStatus.ip": "IP",
  "esStatus.name": "Name",
  "esStatus.master": "Master",
  "esStatus.heapUsage": "Heap usage",
  "esStatus.diskUsage": "Disk usage",
  "esStatus.cpuUsage": "CPU usage",
  "esStatus.load5m": "Load (5m)",
  "esStatus.segmentsCount": "Segments",
  "esStatus.segmentsSize": "Segment memory",
  "esStatus.diskUsed": "Disk used",
  "esStatus.diskTotal": "Disk total",
  "esStatus.yes": "Yes",
  "esStatus.no": "No",
  "esStatus.empty": "No Elasticsearch nodes found.",
  "table.design": "Design",
  "table.data": "Data",
  "table.erDiagram": "ER Diagram",
  "table.mock": "Mock",
  "table.manager": "Manager",
  "table.monitor": "Monitor",
  "table.viewAsJSON": "View as JSON",
  "table.history": "History",
  "global.changeLog": "Changelog",
  "global.util": "Utilities",
  "util.imageTool": "Image tool",
  "global.settings": "Settings",
  "global.plan": "Plan",
  "global.login": "Login",
  "fileManager.parentDir": "Parent directory",
  "fileManager.size": "Size",
  "fileManager.modified": "Modified",
  "fileManager.kind": "Type",
  "fileManager.owner": "Owner",
  "fileManager.folder": "folder",
  "fileManager.items": "{count} items",
  "fileManager.newFolder": "New folder",
  "fileManager.newFile": "New file",
  "fileManager.upload": "Upload",
  "fileManager.rename": "Rename",
  "fileManager.copyName": "Copy name",
  "fileManager.copyPath": "Copy path",
  "fileManager.openTerminal": "Open terminal",
  "fileManager.delete": "Delete",
};

const builtinCatalogs: Readonly<Record<string, TranslationTable>> = {
  en: fallbackTranslations,
  "zh-cn": {
    "common.name": "名称",
    "common.refresh": "刷新",
    "common.download": "下载",
    "common.copied": "已复制",
    "webview.loading": "加载中",
    "webview.error": "发生错误",
    "webview.waiting": "正在等待扩展宿主",
    "webview.route.registered": "视图：{name}",
    "webview.route.pending": "此视图已准备好接入对应功能域。",
    "webview.route.connect": "连接",
    "webview.route.dbFileConnect": "数据库文件连接",
    "webview.route.parquet": "Parquet",
    "webview.route.sqlite": "SQLite",
    "webview.route.result": "查询结果",
    "webview.route.manager": "管理器",
    "webview.route.esStatus": "Elasticsearch 状态",
    "webview.route.design": "表设计",
    "webview.route.erDiagram": "ER 图",
    "webview.route.mock": "模拟数据",
    "webview.route.structDiff": "结构对比",
    "webview.route.keyView": "Redis 键",
    "webview.route.lokiLog": "Loki 日志",
    "webview.route.rabbitQueueView": "RabbitMQ 队列",
    "webview.route.forward": "端口转发",
    "webview.route.xterm": "终端",
    "webview.route.sshTerminal": "SSH 终端",
    "webview.route.fileManager": "远程文件管理器",
    "webview.route.sshStatus": "SSH 状态",
    "webview.route.sshMonitor": "SSH 监控",
    "webview.route.center": "中心",
    "webview.route.document": "文档",
    "webview.route.plan": "计划",
    "webview.route.console": "设置",
    "webview.route.util": "工具",
    "webview.route.image": "图片",
    "esStatus.node": "节点",
    "esStatus.ip": "IP",
    "esStatus.name": "名称",
    "esStatus.master": "主节点",
    "esStatus.heapUsage": "堆使用率",
    "esStatus.diskUsage": "磁盘使用率",
    "esStatus.cpuUsage": "CPU 使用率",
    "esStatus.load5m": "负载（5 分钟）",
    "esStatus.segmentsCount": "段数量",
    "esStatus.segmentsSize": "段内存",
    "esStatus.diskUsed": "磁盘已用",
    "esStatus.diskTotal": "磁盘总量",
    "esStatus.yes": "是",
    "esStatus.no": "否",
    "esStatus.empty": "未找到 Elasticsearch 节点。",
    "table.design": "设计",
    "table.data": "数据",
    "table.erDiagram": "ER 图",
    "table.mock": "模拟",
    "table.manager": "管理器",
    "table.monitor": "监控",
    "table.viewAsJSON": "查看 JSON",
    "table.history": "历史",
    "global.changeLog": "更新日志",
    "global.util": "工具",
    "util.imageTool": "图片工具",
    "global.settings": "设置",
    "global.plan": "计划",
    "global.login": "登录",
    "fileManager.parentDir": "上级目录",
    "fileManager.size": "大小",
    "fileManager.modified": "修改时间",
    "fileManager.kind": "类型",
    "fileManager.owner": "所有者",
    "fileManager.folder": "文件夹",
    "fileManager.items": "{count} 项",
    "fileManager.newFolder": "新建文件夹",
    "fileManager.newFile": "新建文件",
    "fileManager.upload": "上传",
    "fileManager.rename": "重命名",
    "fileManager.copyName": "复制名称",
    "fileManager.copyPath": "复制路径",
    "fileManager.openTerminal": "打开终端",
    "fileManager.delete": "删除",
  },
};

function normalizeLanguage(language: unknown): string {
  if (typeof language !== "string" || language.trim() === "") {
    return "en";
  }
  return language.toLowerCase().replace("_", "-");
}

export class Translator {
  public constructor(
    language: string,
    private readonly translations: TranslationTable =
      builtinCatalogs[normalizeLanguage(language)] ?? fallbackTranslations,
  ) {
    this.language = normalizeLanguage(language);
  }

  private readonly language: string;

  public t(
    key: string,
    fallback = key,
    values: Readonly<Record<string, string | number>> = {},
  ): string {
    const template = this.translations[key] ?? fallback;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  }

  public get locale(): string {
    return this.language;
  }
}

export function createTranslator(
  language: unknown,
  translations?: TranslationTable,
): Translator {
  return new Translator(normalizeLanguage(language), translations);
}
