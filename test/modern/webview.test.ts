import assert from "node:assert/strict";
import test from "node:test";

import { NoopLogger } from "../../src/modern/core/logging";
import { TypedWebviewHandler } from "../../src/modern/core/webviewHandler";
import { renderWebviewHtml } from "../../src/modern/core/webviewHtml";
import { WebviewBridge } from "../../src/modern-webview/bridge";
import { readWebviewBootstrap } from "../../src/modern-webview/bootstrap";
import {
  routeFromPath,
  routeLocation,
  routePath,
  WEBVIEW_ROUTES,
} from "../../src/modern-webview/routeRegistry";
import { buildDocumentationUrl } from "../../src/modern-webview/document";
import { WebviewStateStore } from "../../src/modern-webview/state";

class FakeMessageTarget {
  public listener: ((event: MessageEvent) => void) | undefined;
  public removed = false;

  public addEventListener(
    _type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.listener = listener as (event: MessageEvent) => void;
  }

  public removeEventListener(
    _type: string,
    _listener: EventListenerOrEventListenerObject,
  ): void {
    this.removed = true;
    this.listener = undefined;
  }

  public dispatch(data: unknown): void {
    this.listener?.({ data } as MessageEvent);
  }
}

test("Webview bridge provides init, typed dispatch, and disposal", () => {
  const target = new FakeMessageTarget();
  const sent: unknown[] = [];
  const bridge = new WebviewBridge(
    {
      getState: () => ({ persisted: true }),
      postMessage: (message) => sent.push(message),
      setState: (state) => state,
    },
    target,
  );
  const messages: string[] = [];
  bridge.on("setState", (_content, message) => messages.push(message.type));
  bridge.onAny((_content, message) => messages.push("any:" + message.type));

  bridge.init("query");
  target.dispatch({ type: "setState", content: { value: 1 } });
  bridge.dispose();

  assert.deepEqual(sent, [
    { type: "init", content: { type: "query" } },
  ]);
  assert.deepEqual(messages, ["setState", "any:setState"]);
  assert.equal(target.removed, true);
});

test("host Webview handler routes messages and releases listeners", async () => {
  let receive: ((message: { type: string; content?: unknown }) => void) | undefined;
  let disposed: (() => void) | undefined;
  const sent: unknown[] = [];
  const webview = {
    postMessage: async (message: unknown) => {
      sent.push(message);
      return true;
    },
    onDidReceiveMessage: (listener: typeof receive) => {
      receive = listener;
      return { dispose: () => { receive = undefined; } };
    },
    onDidDispose: (listener: () => void) => {
      disposed = listener;
      return { dispose: () => { disposed = undefined; } };
    },
  };
  const handler = new TypedWebviewHandler(webview, new NoopLogger());
  const received: unknown[] = [];
  handler.onInit("query", (content) => {
    received.push(content);
  });

  receive?.({ type: "init", content: { type: "query" } });
  await handler.setWebviewState({ rows: [] });
  disposed?.();
  await handler.send("stale");

  assert.deepEqual(received, [{ type: "query" }]);
  assert.deepEqual(sent, [{ type: "setState", content: { rows: [] } }]);
});

test("host Webview handler exposes reset and dispose lifecycle hooks", () => {
  let disposed: (() => void) | undefined;
  const webview = {
    postMessage: async () => true,
    onDidReceiveMessage: () => ({ dispose: () => {} }),
    onDidDispose: (listener: () => void) => {
      disposed = listener;
      return { dispose: () => { disposed = undefined; } };
    },
  };
  const handler = new TypedWebviewHandler(webview, new NoopLogger());
  let resets = 0;
  let disposals = 0;
  handler.onDidReset(() => { resets += 1; });
  handler.onDidDispose(() => { disposals += 1; });

  handler.reset();
  disposed?.();

  assert.equal(resets, 1);
  assert.equal(disposals, 1);
});

test("Webview HTML renderer closes local asset and CSP references", () => {
  const html = renderWebviewHtml(
    '<html><head></head><body><script type="module" src="./assets/app.js"></script><div data-config="{{configs}}"></div></body></html>',
    {
      cspSource: "vscode-webview://test",
      nonce: "nonce-value",
      config: { language: "en", quote: "'" },
      resolveAsset: (asset) => "vscode-webview://test/" + asset,
    },
  );
  assert.match(html, /nonce="nonce-value"/);
  assert.match(html, /vscode-webview:\/\/test\/assets\/app\.js/);
  assert.match(html, /&amp;quot|&quot;/);
  assert.doesNotMatch(html, /\{\{configs\}\}/);
});

test("Webview state store persists locally and reports host state changes", () => {
  const target = new FakeMessageTarget();
  const sent: unknown[] = [];
  const bridge = new WebviewBridge(
    {
      getState: () => ({ page: "query" }),
      postMessage: (message) => sent.push(message),
      setState: (state) => state,
    },
    target,
  );
  const state = new WebviewStateStore(bridge);
  state.update("connectionKey", "oracle-1");

  assert.equal(state.get("page", "home"), "query");
  assert.equal(state.get("connectionKey", ""), "oracle-1");
  assert.deepEqual(sent, [
    {
      type: "upState",
      content: { key: "connectionKey", value: "oracle-1" },
    },
  ]);
});

test("Webview route registry preserves target names and nested paths", () => {
  assert.deepEqual(
    WEBVIEW_ROUTES.map((route) => route.name),
    [
      "connect",
      "dbFileConnect",
      "parquet",
      "sqlite",
      "result",
      "manager",
      "esStatus",
      "design",
      "erDiagram",
      "mock",
      "structDiff",
      "keyView",
      "rabbitQueueView",
      "forward",
      "xterm",
      "sshTerminal",
      "fileManager",
      "sshStatus",
      "sshMonitor",
      "document",
      "plan",
      "console",
      "util",
      "image",
    ],
  );
  assert.deepEqual(routeLocation("/connect"), { name: "connect" });
  assert.equal(routePath("sqlite"), "/sqlite");
  assert.equal(routeFromPath("/keyView")?.name, "keyView");
  assert.equal(routeFromPath("/rabbitQueueView")?.name, "rabbitQueueView");
  assert.equal(routeFromPath("/forward")?.name, "forward");
  assert.equal(routeFromPath("/structDiff")?.name, "structDiff");
  assert.equal(routeFromPath("/sshMonitor")?.name, "sshMonitor");
  assert.equal(routeFromPath("/fileManager")?.name, "fileManager");
  assert.equal(routeFromPath("/es-status")?.name, "esStatus");
  assert.equal(routePath("document"), "/center/document");
  assert.equal(routeFromPath("/center/document")?.name, "document");
});

test("documentation route preserves target language and theme URL semantics", () => {
  assert.equal(
    buildDocumentationUrl("https://database-client.com/", "en", "dark"),
    "https://database-client.com/docs/?theme=dark",
  );
  assert.equal(
    buildDocumentationUrl("http://127.0.0.1:8828/", "zh-CN", "light"),
    "http://127.0.0.1:8828/docs/#/zh/?theme=light",
  );
  assert.equal(buildDocumentationUrl("", "en", "dark"), "");
});

test("Webview bootstrap reads host config and tolerates a development placeholder", () => {
  const config = {
    language: "zh-CN",
    route: "design",
    state: { page: "design", connectionKey: "oracle-1" },
    config: { defaultSelectLimit: 1000 },
  };
  const documentLike = {
    getElementById: (id: string) =>
      id === "dbclient-configs"
        ? ({ getAttribute: () => JSON.stringify(config) } as unknown as HTMLElement)
        : null,
  } as Pick<Document, "getElementById">;

  assert.deepEqual(readWebviewBootstrap(documentLike), {
    appName: undefined,
    language: "zh-CN",
    route: "design",
    state: config.state,
    config: config.config,
  });
  assert.deepEqual(
    readWebviewBootstrap({ getElementById: () => null }),
    {
      appName: undefined,
      language: "en",
      route: undefined,
      state: {},
      config: {},
    },
  );
});
