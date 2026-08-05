import manifest from "../../../package.json";

interface ManifestCommandContribution {
  readonly command?: unknown;
}

interface ExtensionManifestShape {
  readonly contributes?: {
    readonly commands?: readonly ManifestCommandContribution[];
  };
}

const packageManifest = manifest as ExtensionManifestShape;

export const TARGET_COMMAND_IDS = Object.freeze(
  (packageManifest.contributes?.commands ?? [])
    .map((contribution) => contribution.command)
    .filter((command): command is string => typeof command === "string"),
);

export const TARGET_COMMAND_SET = new Set(TARGET_COMMAND_IDS);
