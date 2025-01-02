type ClassType<T> = new (...args: any[]) => T;

export type ServiceInitContext = {
  getService: <T extends Service>(classType: ClassType<T>) => T;
};

export abstract class Service {
  init(context: ServiceInitContext) {}
}

export class AssembledServices {
  private _services: Map<ClassType<Service>, Service>;

  constructor(services: Map<ClassType<Service>, Service>) {
    this._services = services;
  }

  get<T extends Service>(classType: ClassType<T>): T {
    if (!this._services.has(classType)) {
      throw new Error(`Service ${classType.name} not found`);
    }
    return this._services.get(classType) as T;
  }
}

export const autowireServices = (
  serviceClasses: ClassType<Service>[],
): AssembledServices => {
  const registry = new Map<ClassType<Service>, Service>();

  // Instantiate all services
  for (const serviceClass of serviceClasses) {
    const service = new serviceClass();
    registry.set(serviceClass, service);
  }

  // Create a context object that provides a method to get services
  const context: ServiceInitContext = {
    getService: <T extends Service>(classType: ClassType<T>) => {
      const service = registry.get(classType);
      if (!service) throw new Error(`Service ${classType.name} not found`);
      return service as T;
    },
  };

  // Initialize all services, with all dependencies autowired
  for (const serviceClass of serviceClasses) {
    const service = registry.get(serviceClass);
    service!.init(context);
  }

  return new AssembledServices(registry);
};
