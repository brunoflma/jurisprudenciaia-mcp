export class WorkerEntrypoint<Environment = unknown, Properties = unknown> {
  protected readonly ctx: ExecutionContext<Properties>;
  protected readonly env: Environment;

  constructor(ctx: ExecutionContext<Properties>, env: Environment) {
    this.ctx = ctx;
    this.env = env;
  }
}

export class DurableObject<Environment = unknown> {
  constructor(protected readonly ctx: DurableObjectState, protected readonly env: Environment) {}
}
