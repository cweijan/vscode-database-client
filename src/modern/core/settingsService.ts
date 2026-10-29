import * as path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import * as vscode from "vscode";

import type { Logger } from "./contracts";

export interface SettingOption {
  readonly name: string;
  readonly value: unknown;
  readonly type: string;
  readonly description: string;
  readonly enum?: readonly unknown[];
}

interface ManifestProperty {
  readonly type?: string;
  readonly default?: unknown;
  readonly description?: string;
  readonly enum?: readonly unknown[];
}

interface ExtensionManifest {
  readonly contributes?: {
    readonly configuration?: readonly {
      readonly properties?: Readonly<Record<string, ManifestProperty>>;
    }[];
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sectionName(name: string): string {
  return name.replace(/^database-client\./, "");
}

function optionValue(value: unknown, type: string): unknown {
  if (type === "boolean") return Boolean(value);
  if (type === "number" || type === "integer") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return value;
}

export class SettingsService {
  private manifestProperties: Readonly<Record<string, ManifestProperty>> | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly extensionId: string,
    private readonly logger: Logger,
  ) {}

  public async list(): Promise<SettingOption[]> {
    const properties = await this.loadProperties();
    const configuration = vscode.workspace.getConfiguration("database-client");
    return Object.entries(properties).map(([fullName, property]) => {
      const name = sectionName(fullName);
      const value = configuration.get(name, property.default);
      return {
        name,
        value,
        type: property.type || typeof value,
        description: property.description || name,
        ...(property.enum ? { enum: property.enum } : {}),
      };
    });
  }

  public async update(option: Pick<SettingOption, "name" | "value" | "type">): Promise<void> {
    const name = sectionName(option.name);
    await vscode.workspace.getConfiguration("database-client").update(
      name,
      optionValue(option.value, option.type),
      vscode.ConfigurationTarget.Global,
    );
  }

  public async reset(options: readonly Pick<SettingOption, "name">[]): Promise<void> {
    const configuration = vscode.workspace.getConfiguration("database-client");
    for (const option of options) {
      await configuration.update(
        sectionName(option.name),
        undefined,
        vscode.ConfigurationTarget.Global,
      );
    }
  }

  public async openMoreSettings(tag?: unknown): Promise<void> {
    const suffix = tag ? ` @tag:${String(tag)}` : "";
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      { query: `@ext:${this.extensionId}${suffix}` },
    );
  }

  public async exportConfig(workspace = false): Promise<void> {
    const options = await this.list();
    const file = await vscode.window.showSaveDialog({
      saveLabel: "Export configuration",
      filters: { JSON: ["json"] },
      defaultUri: vscode.Uri.file(workspace ? "database-client-workspace.json" : "database-client.json"),
    });
    if (!file) return;
    const values = Object.fromEntries(options.map((option) => [option.name, option.value]));
    await writeFile(file.fsPath, JSON.stringify({ version: 1, workspace, values }, null, 2), "utf8");
  }

  public async importConfig(): Promise<number> {
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: "Import configuration",
      filters: { JSON: ["json"] },
    });
    const file = files?.[0];
    if (!file) return 0;
    const source = JSON.parse(await readFile(file.fsPath, "utf8")) as unknown;
    const values = record(record(source).values || source);
    const properties = await this.loadProperties();
    let count = 0;
    for (const [name, value] of Object.entries(values)) {
      const property = properties[`database-client.${sectionName(name)}`];
      if (!property) continue;
      await this.update({
        name,
        value,
        type: property.type || typeof value,
      });
      count += 1;
    }
    return count;
  }

  private async loadProperties(): Promise<Readonly<Record<string, ManifestProperty>>> {
    if (this.manifestProperties) return this.manifestProperties;
    try {
      const manifest = JSON.parse(
        await readFile(path.join(this.extensionUri.fsPath, "package.json"), "utf8"),
      ) as ExtensionManifest;
      const groups = manifest.contributes?.configuration || [];
      this.manifestProperties = Object.assign(
        {},
        ...groups.map((group) => group.properties || {}),
      );
    } catch (error) {
      this.logger.warn("Unable to read configuration descriptors", error);
      this.manifestProperties = {};
    }
    return this.manifestProperties || {};
  }
}
