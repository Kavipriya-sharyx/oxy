import { Injectable } from "@nestjs/common";
import { createNamespace, Namespace } from "cls-hooked";

@Injectable()
export class RequestContextService {
  private readonly namespace: Namespace;

  constructor() {
    this.namespace = createNamespace("request-context"); // Create a namespace for request context
  }

  set(key: string, value: any) {
    this.namespace.set(key, value); // Store data in the namespace
  }

  get<T>(key: string): T {
    return this.namespace.get(key); // Retrieve data from the namespace
  }

  run(callback: () => void) {
    this.namespace.run(callback); // Run the callback within the context
  }
}
