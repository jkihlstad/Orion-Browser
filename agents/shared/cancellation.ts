/**
 * Task Cancellation and Timeout Utilities
 * Provides AbortController-based cancellation for async operations
 */

// ============================================================================
// Types
// ============================================================================

export interface CancellableTask<T> {
  promise: Promise<T>;
  cancel: () => void;
  isCancelled: () => boolean;
}

export interface TaskOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onTimeout?: () => void;
  onCancel?: () => void;
}

export class CancellationError extends Error {
  constructor(message: string = 'Operation cancelled') {
    super(message);
    this.name = 'CancellationError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// Cancellation Token
// ============================================================================

/**
 * A cancellation token that can be used to cancel async operations
 */
export class CancellationToken {
  private controller: AbortController;
  private cancelled: boolean = false;
  private reason?: string;

  constructor() {
    this.controller = new AbortController();
  }

  /**
   * Get the AbortSignal for this token
   */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Check if cancellation has been requested
   */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Get the cancellation reason if cancelled
   */
  get cancellationReason(): string | undefined {
    return this.reason;
  }

  /**
   * Request cancellation
   */
  cancel(reason?: string): void {
    if (!this.cancelled) {
      this.cancelled = true;
      this.reason = reason;
      this.controller.abort(new CancellationError(reason));
    }
  }

  /**
   * Throw if cancellation has been requested
   */
  throwIfCancelled(): void {
    if (this.cancelled) {
      throw new CancellationError(this.reason);
    }
  }

  /**
   * Register a callback to be called when cancellation is requested
   */
  onCancel(callback: () => void): () => void {
    const handler = () => callback();
    this.controller.signal.addEventListener('abort', handler);
    return () => this.controller.signal.removeEventListener('abort', handler);
  }
}

// ============================================================================
// Task Utilities
// ============================================================================

/**
 * Create a cancellable version of a promise
 */
export function cancellable<T>(
  promise: Promise<T>,
  options: TaskOptions = {}
): CancellableTask<T> {
  const controller = new AbortController();
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Link to external signal if provided
  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      if (!cancelled) {
        cancelled = true;
        options.onCancel?.();
        controller.abort(new CancellationError());
      }
    });
  }

  // Set up timeout
  if (options.timeoutMs && options.timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        options.onTimeout?.();
        controller.abort(new TimeoutError(`Timed out after ${options.timeoutMs}ms`));
      }
    }, options.timeoutMs);
  }

  const wrappedPromise = new Promise<T>((resolve, reject) => {
    // Handle abort
    controller.signal.addEventListener('abort', () => {
      reject(controller.signal.reason || new CancellationError());
    });

    // Handle original promise
    promise
      .then((result) => {
        if (!cancelled) {
          if (timeoutId) clearTimeout(timeoutId);
          resolve(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          if (timeoutId) clearTimeout(timeoutId);
          reject(error);
        }
      });
  });

  return {
    promise: wrappedPromise,
    cancel: () => {
      if (!cancelled) {
        cancelled = true;
        if (timeoutId) clearTimeout(timeoutId);
        options.onCancel?.();
        controller.abort(new CancellationError());
      }
    },
    isCancelled: () => cancelled,
  };
}

/**
 * Run a function with a timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  const task = cancellable(fn(), { timeoutMs });

  try {
    return await task.promise;
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new TimeoutError(errorMessage || error.message);
    }
    throw error;
  }
}

/**
 * Run a function with cancellation support
 */
export async function withCancellation<T>(
  fn: (token: CancellationToken) => Promise<T>,
  token: CancellationToken
): Promise<T> {
  token.throwIfCancelled();

  try {
    return await fn(token);
  } catch (error) {
    if (error instanceof CancellationError) {
      throw error;
    }
    token.throwIfCancelled();
    throw error;
  }
}

/**
 * Create a delay that can be cancelled
 */
export function cancellableDelay(
  ms: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(signal.reason || new CancellationError());
      });
    }
  });
}

// ============================================================================
// Task Manager
// ============================================================================

/**
 * Manages multiple cancellable tasks
 */
export class TaskManager {
  private tasks: Map<string, CancellableTask<unknown>> = new Map();
  private tokens: Map<string, CancellationToken> = new Map();

  /**
   * Register and start a task
   */
  run<T>(
    taskId: string,
    fn: () => Promise<T>,
    options: TaskOptions = {}
  ): CancellableTask<T> {
    // Cancel existing task with same ID
    this.cancel(taskId);

    const task = cancellable(fn(), options);
    this.tasks.set(taskId, task as CancellableTask<unknown>);

    // Clean up when done
    task.promise.finally(() => {
      if (this.tasks.get(taskId) === task) {
        this.tasks.delete(taskId);
      }
    });

    return task;
  }

  /**
   * Create a cancellation token for a task
   */
  createToken(taskId: string): CancellationToken {
    // Cancel existing token
    const existingToken = this.tokens.get(taskId);
    if (existingToken) {
      existingToken.cancel('Replaced by new token');
    }

    const token = new CancellationToken();
    this.tokens.set(taskId, token);

    return token;
  }

  /**
   * Cancel a specific task
   */
  cancel(taskId: string, reason?: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.cancel();
      this.tasks.delete(taskId);
    }

    const token = this.tokens.get(taskId);
    if (token) {
      token.cancel(reason);
      this.tokens.delete(taskId);
    }
  }

  /**
   * Cancel all tasks
   */
  cancelAll(reason?: string): void {
    for (const task of this.tasks.values()) {
      task.cancel();
    }
    this.tasks.clear();

    for (const token of this.tokens.values()) {
      token.cancel(reason);
    }
    this.tokens.clear();
  }

  /**
   * Check if a task is running
   */
  isRunning(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    return task !== undefined && !task.isCancelled();
  }

  /**
   * Get all running task IDs
   */
  getRunningTasks(): string[] {
    return Array.from(this.tasks.keys()).filter(id => this.isRunning(id));
  }

  /**
   * Wait for a task to complete
   */
  async wait<T>(taskId: string): Promise<T | undefined> {
    const task = this.tasks.get(taskId) as CancellableTask<T> | undefined;
    if (!task) return undefined;

    try {
      return await task.promise;
    } catch (error) {
      if (error instanceof CancellationError) {
        return undefined;
      }
      throw error;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let taskManagerInstance: TaskManager | null = null;

export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager();
  }
  return taskManagerInstance;
}

export function resetTaskManager(): void {
  if (taskManagerInstance) {
    taskManagerInstance.cancelAll('Task manager reset');
    taskManagerInstance = null;
  }
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Check if an error is a cancellation error
 */
export function isCancellationError(error: unknown): error is CancellationError {
  return error instanceof CancellationError;
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

/**
 * Ignore cancellation errors, rethrow others
 */
export function ignoreCancellation<T>(error: unknown): T | undefined {
  if (isCancellationError(error) || isTimeoutError(error)) {
    return undefined;
  }
  throw error;
}
