import type { RemoteEntry } from "./sshService";

/** System directories hidden by the target when pruning the SFTP root. */
const PRUNED_SFTP_ROOT_PATHS = new Set([
  "/boot",
  "/cdrom",
  "/dev",
  "/lost+found",
  "/media",
  "/proc",
  "/run",
  "/srv",
  "/sys",
  "/bin",
  "/lib",
  "/lib32",
  "/lib64",
  "/libx32",
  "/sbin",
]);

export function shouldPruneSftpRootEntry(
  pruneSFTPRoot: boolean,
  rootPath: string,
  remotePath: string,
  entryPath: string,
  entryKind: RemoteEntry["kind"],
): boolean {
  return pruneSFTPRoot
    && entryKind === "directory"
    && remotePath === rootPath
    && PRUNED_SFTP_ROOT_PATHS.has(entryPath);
}
