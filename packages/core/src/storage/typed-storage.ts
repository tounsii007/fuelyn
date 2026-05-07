import type { z } from 'zod';
import type { StorageAdapter } from './storage-adapter';

export class TypedStorage<T> {
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly key: string,
    private readonly schema: z.ZodType<T>,
    private readonly defaultValue: T,
  ) {}

  async get(): Promise<T> {
    try {
      const raw = await this.adapter.getItem(this.key);
      if (raw == null) return this.defaultValue;

      const result = this.schema.safeParse(JSON.parse(raw) as unknown);
      if (!result.success) {
        await this.safeRemoveCorruptedValue();
        return this.defaultValue;
      }

      return result.data;
    } catch {
      return this.defaultValue;
    }
  }

  async set(value: T): Promise<void> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new TypeError(`Storage value for "${this.key}" does not match schema`);
    }

    await this.adapter.setItem(this.key, JSON.stringify(result.data));
  }

  async update(updater: (current: T) => T): Promise<T> {
    const current = await this.get();
    const updated = updater(current);
    await this.set(updated);
    return updated;
  }

  async remove(): Promise<void> {
    await this.adapter.removeItem(this.key);
  }

  private async safeRemoveCorruptedValue(): Promise<void> {
    try {
      await this.adapter.removeItem(this.key);
    } catch {
      // Ignore cleanup failures and return the default value.
    }
  }
}
