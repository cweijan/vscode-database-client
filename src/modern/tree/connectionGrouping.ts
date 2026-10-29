export interface ConnectionGroupEntry<T> {
  readonly value: T;
  readonly group?: string;
}

export interface ConnectionGroupBranch<T> {
  readonly kind: "group";
  readonly label: string;
  readonly path: string;
  readonly children: readonly ConnectionGroupTree<T>[];
}

export type ConnectionGroupTree<T> = T | ConnectionGroupBranch<T>;

interface IndexedConnection<T> {
  readonly value: T;
  readonly segments: readonly string[];
}

function groupSegments(group: string | undefined): readonly string[] {
  return typeof group === "string"
    ? group.split("/").map((segment) => segment.trim()).filter(Boolean)
    : [];
}

function isGroupBranch<T>(entry: ConnectionGroupTree<T>): entry is ConnectionGroupBranch<T> {
  return Boolean(
    entry
    && typeof entry === "object"
    && "kind" in entry
    && entry.kind === "group",
  );
}

function buildTree<T>(entries: readonly IndexedConnection<T>[], level: number, parentPath: string): readonly ConnectionGroupTree<T>[] {
  const groups = new Map<string, IndexedConnection<T>[]>();
  const direct: IndexedConnection<T>[] = [];

  for (const entry of entries) {
    const label = entry.segments[level];
    if (!label) {
      direct.push(entry);
      continue;
    }
    const bucket = groups.get(label);
    if (bucket) {
      bucket.push(entry);
    } else {
      groups.set(label, [entry]);
    }
  }

  const grouped = Array.from(groups, ([label, children]) => {
    const path = parentPath ? `${parentPath}/${label}` : label;
    return {
      kind: "group" as const,
      label,
      path,
      children: buildTree(children, level + 1, path),
    } satisfies ConnectionGroupBranch<T>;
  });

  // The installed extension deliberately places groups before loose
  // connections while preserving the stored order inside both partitions.
  return [...grouped, ...direct.map((entry) => entry.value)];
}

export function groupConnectionEntries<T>(
  entries: readonly ConnectionGroupEntry<T>[],
): readonly ConnectionGroupTree<T>[] {
  return buildTree(
    entries.map((entry) => ({ value: entry.value, segments: groupSegments(entry.group) })),
    0,
    "",
  );
}

export function isConnectionGroupBranch<T>(
  entry: ConnectionGroupTree<T>,
): entry is ConnectionGroupBranch<T> {
  return isGroupBranch(entry);
}
