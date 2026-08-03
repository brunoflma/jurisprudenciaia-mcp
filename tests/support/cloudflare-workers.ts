export class WorkerEntrypoint<Environment = unknown, Properties = unknown> {
  protected readonly ctx: ExecutionContext<Properties>;
  protected readonly env: Environment;

  constructor(ctx: ExecutionContext<Properties>, env: Environment) {
    this.ctx = ctx;
    this.env = env;
  }
}
