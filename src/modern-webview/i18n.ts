export type TranslationTable = Readonly<Record<string, string>>;

const fallbackTranslations: TranslationTable = {
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
};

const builtinCatalogs: Readonly<Record<string, TranslationTable>> = {
  en: fallbackTranslations,
  "zh-cn": {
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
