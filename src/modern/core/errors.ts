export class DatabaseClientError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DatabaseClientError";
  }
}

export class OperationCancelledError extends DatabaseClientError {
  public constructor(operation: string) {
    super(operation + " was cancelled", "operation-cancelled");
    this.name = "OperationCancelledError";
  }
}

export class UnsupportedDatabaseOperationError extends DatabaseClientError {
  public constructor(operation: string, databaseType: string) {
    super(
      operation + " is not supported by the " + databaseType + " adapter",
      "unsupported-operation",
    );
    this.name = "UnsupportedDatabaseOperationError";
  }
}

export class SourceRecoveryPendingError extends DatabaseClientError {
  public constructor(command: string) {
    super(
      `The source implementation for command ${command} is still being recovered`,
      "source-recovery-pending",
    );
    this.name = "SourceRecoveryPendingError";
  }
}
