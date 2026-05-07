import type { z } from 'zod';
import { TypedStorage } from './typed-storage';
import type { StorageAdapter } from './storage-adapter';

export { TypedStorage } from './typed-storage';
export { WebStorageAdapter } from './web-storage-adapter';
export type { StorageAdapter } from './storage-adapter';

export function createTypedStorage<T>(
  adapter: StorageAdapter,
  key: string,
  schema: z.ZodType<T>,
  defaultValue: T,
): TypedStorage<T> {
  return new TypedStorage(adapter, key, schema, defaultValue);
}
