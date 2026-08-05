import type { Disposable } from "../core/contracts";

export interface ProviderRegistration {
  readonly id: string;
  readonly languages: readonly string[];
  readonly dispose: () => void;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderRegistration>();

  public register(
    id: string,
    languages: readonly string[],
    dispose: () => void = () => {},
  ): Disposable {
    if (this.providers.has(id)) {
      throw new Error("Provider already registered: " + id);
    }
    const registration: ProviderRegistration = {
      id,
      languages: [...languages],
      dispose,
    };
    this.providers.set(id, registration);
    return {
      dispose: () => {
        if (this.providers.get(id) === registration) {
          registration.dispose();
          this.providers.delete(id);
        }
      },
    };
  }

  public list(): readonly ProviderRegistration[] {
    return [...this.providers.values()];
  }
}
