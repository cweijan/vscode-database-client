import * as os from "node:os";
import * as path from "node:path";

export function isManagedDatabaseClientPath(fileName: string): boolean {
  const candidate = path.resolve(fileName);
  const managedRoot = path.resolve(os.homedir(), ".dbclient");
  const relative = path.relative(managedRoot, candidate);
  return relative === ""
    || (!relative.startsWith(`..${path.sep}`)
      && relative !== ".."
      && !path.isAbsolute(relative));
}
