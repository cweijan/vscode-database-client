import * as vscode from "vscode";

import type { CloudUser } from "../core/cloudService";
import type { ExtensionServices } from "../core/extensionServices";
import { registerWebviewUtilityProtocols } from "../commands/webviewUtilityProtocols";

class DatabaseClientAuthenticationSession implements vscode.AuthenticationSession {
  public readonly scopes: readonly string[] = [];
  public readonly account: vscode.AuthenticationSessionAccountInformation;

  public constructor(private readonly user: CloudUser) {
    const id = String(user.email || "database-client");
    this.id = id;
    this.account = { id, label: String(user.nickName || user.email || id) };
  }

  public readonly id: string;

  public get accessToken(): string {
    return String(this.user.token || "");
  }
}

export class DatabaseClientAuthenticationProvider
  implements vscode.AuthenticationProvider, vscode.Disposable
{
  private readonly changes = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private readonly userChange: { dispose: () => void };
  private lastSession: DatabaseClientAuthenticationSession | undefined;

  public constructor(private readonly services: ExtensionServices) {
    this.lastSession = this.currentSession();
    this.userChange = services.cloud.onUserChanged(() => {
      const previous = this.lastSession;
      const session = this.currentSession();
      this.lastSession = session;
      this.changes.fire({
        added: previous || !session ? [] : [session],
        removed: session || !previous ? [] : [previous],
        changed: previous && session ? [session] : [],
      });
    });
  }

  public get onDidChangeSessions(): vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> {
    return this.changes.event;
  }

  public getSessions(
    _scopes?: readonly string[],
  ): Thenable<readonly vscode.AuthenticationSession[]> {
    const session = this.currentSession();
    return Promise.resolve(session ? [session] : []);
  }

  public async createSession(
    _scopes: readonly string[],
  ): Promise<vscode.AuthenticationSession> {
    const state: Record<string, unknown> = {};
    await this.services.webviews.createWebviewPanel({
      title: "Database Client",
      type: "plan",
      route: "plan",
      state,
      eventHandler: (handler) => {
        registerWebviewUtilityProtocols({
          route: "plan",
          state,
          webviewState: state,
          services: this.services,
          handler,
        });
      },
    });
    const session = this.currentSession();
    if (!session) {
      throw new Error("Sign in to Database Client to create an authentication session");
    }
    return session;
  }

  public async removeSession(sessionId: string): Promise<void> {
    if (this.currentSession()?.id === sessionId) {
      await this.services.cloud.setUser(undefined, true);
    }
  }

  public dispose(): void {
    this.userChange.dispose();
    this.changes.dispose();
  }

  private currentSession(): DatabaseClientAuthenticationSession | undefined {
    const user = this.services.cloud.getUser();
    return user?.token ? new DatabaseClientAuthenticationSession(user) : undefined;
  }
}

export function registerModernAuthentication(
  services: ExtensionServices,
): vscode.Disposable[] {
  const provider = new DatabaseClientAuthenticationProvider(services);
  const registration = vscode.authentication.registerAuthenticationProvider(
    "dbclient.auth",
    "Database Client",
    provider,
  );
  return [provider, registration];
}
