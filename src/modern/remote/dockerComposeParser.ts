import { load } from "js-yaml";

export interface DockerComposeImage {
  readonly service: string;
  readonly image: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseDockerComposeImages(source: string): DockerComposeImage[] {
  let value: unknown;
  try {
    value = load(source);
  } catch (error) {
    throw new Error(`Invalid Docker Compose YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  const services = record(record(value).services);
  return Object.entries(services)
    .map(([service, definition]): DockerComposeImage | undefined => {
      const image = record(definition).image;
      return typeof image === "string" && image.trim()
        ? { service, image: image.trim() }
        : undefined;
    })
    .filter((item): item is DockerComposeImage => item !== undefined);
}
