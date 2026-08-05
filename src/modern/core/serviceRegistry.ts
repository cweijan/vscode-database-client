import type { Disposable } from "./contracts";

export class ServiceRegistry<Service> implements Disposable {
  private readonly services = new Map<string, Service>();

  public register(
    id: string,
    service: Service,
    dispose?: (service: Service) => void,
  ): Disposable {
    if (this.services.has(id)) {
      throw new Error("Service already registered: " + id);
    }
    this.services.set(id, service);
    return {
      dispose: () => {
        const current = this.services.get(id);
        if (current === service) {
          this.services.delete(id);
          dispose?.(service);
        }
      },
    };
  }

  public get(id: string): Service {
    const service = this.services.get(id);
    if (!service) {
      throw new Error("Service is not registered: " + id);
    }
    return service;
  }

  public has(id: string): boolean {
    return this.services.has(id);
  }

  public ids(): readonly string[] {
    return [...this.services.keys()].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  public dispose(): void {
    this.services.clear();
  }
}
