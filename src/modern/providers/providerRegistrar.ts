import type { Disposable } from "../core/contracts";
import {
  ProviderRegistry,
  type ProviderRegistration,
} from "./providerRegistry";

export interface ProviderHost {
  registerProvider(
    registration: ProviderRegistration,
  ): Disposable;
}

export class ProviderRegistrar {
  public constructor(
    private readonly registry: ProviderRegistry,
    private readonly host: ProviderHost,
  ) {}

  public register(
    id: string,
    languages: readonly string[],
    dispose: () => void = () => {},
  ): Disposable {
    const source = this.registry.register(id, languages, dispose);
    const host = this.host.registerProvider({
      id,
      languages,
      dispose: () => {},
    });
    return {
      dispose: () => {
        host.dispose();
        source.dispose();
      },
    };
  }
}
