export type RemoteFileEntryType = "file" | "directory" | "link" | "other";

export interface RemoteMenuEntry {
  readonly name: string;
  readonly path: string;
  readonly type: RemoteFileEntryType;
}

export type RemoteContextMenuAction =
  | "rename"
  | "copyName"
  | "copyPath"
  | "openFolderTerminal"
  | "download"
  | "delete"
  | "createFile"
  | "createFolder";

export interface RemoteContextMenuItem {
  readonly id: RemoteContextMenuAction;
  readonly labelKey: string;
  readonly icon: string;
  readonly dividerBefore?: boolean;
  readonly disabled?: boolean;
}

/**
 * Keep the remote manager's ordering identical to the target: directories,
 * links, and ordinary entries are grouped before the selected column sort.
 */
export function remoteEntryTypeRank(type: RemoteFileEntryType): number {
  if (type === "directory") return 0;
  if (type === "link") return 1;
  return 2;
}

export function remoteContextMenuItems(
  entry: RemoteMenuEntry | undefined,
  allowMutations: boolean,
  fsType: string | undefined,
  restricted = false,
): readonly RemoteContextMenuItem[] {
  if (!entry) {
    return [
      {
        id: "createFile",
        labelKey: "fileManager.newFile",
        icon: "codicon codicon-new-file",
        disabled: !allowMutations,
      },
      {
        id: "createFolder",
        labelKey: "fileManager.newFolder",
        icon: "codicon codicon-new-folder",
        disabled: !allowMutations,
      },
    ];
  }

  const items: RemoteContextMenuItem[] = [];
  if (!restricted && allowMutations) {
    items.push(
      {
        id: "rename",
        labelKey: "fileManager.rename",
        icon: "codicon codicon-edit yellow",
        dividerBefore: true,
      },
      {
        id: "copyName",
        labelKey: "fileManager.copyName",
        icon: "codicon codicon-symbol-string",
      },
    );
  }
  items.push({
    id: "copyPath",
    labelKey: "fileManager.copyPath",
    icon: "codicon codicon-copy",
    dividerBefore: true,
  });
  if (entry.type === "directory" && fsType?.toLowerCase() !== "s3") {
    items.push({
      id: "openFolderTerminal",
      labelKey: "fileManager.openTerminal",
      icon: "codicon codicon-terminal green",
    });
  }
  if (entry.type === "file" || entry.type === "directory") {
    items.push({
      id: "download",
      labelKey: "common.download",
      icon: "codicon codicon-cloud-download blue",
      dividerBefore: true,
    });
  }
  if (!restricted && allowMutations) {
    items.push({
      id: "delete",
      labelKey: "fileManager.delete",
      icon: "codicon codicon-trash red",
    });
  }
  return items;
}
