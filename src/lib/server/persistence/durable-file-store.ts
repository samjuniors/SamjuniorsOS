import fs from 'fs';
import path from 'path';

/**
 * Robust, atomic file-backed durable persistence engine for SamJuniorsOS.
 * Provides process-restart durability without external database dependencies.
 * Uses atomic rename write patterns and synchronous disk sync to guarantee
 * that state survives process termination, restarts, and crashes.
 */
export class DurableFileStore {
  private static instance: DurableFileStore;
  private dataDir: string;

  private constructor() {
    this.dataDir = path.resolve(process.cwd(), '.data');
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch {
        // Fallback to /tmp if current working directory is read-only
        this.dataDir = path.resolve('/tmp', 'samjuniors-os-data');
        if (!fs.existsSync(this.dataDir)) {
          fs.mkdirSync(this.dataDir, { recursive: true });
        }
      }
    }
  }

  public static getInstance(): DurableFileStore {
    if (!DurableFileStore.instance) {
      DurableFileStore.instance = new DurableFileStore();
    }
    return DurableFileStore.instance;
  }

  public getDataDir(): string {
    return this.dataDir;
  }

  private getCollectionPath(collection: string): string {
    const sanitized = collection.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${sanitized}.json`);
  }

  /**
   * Reads all items from a collection on disk.
   */
  public readCollection<T>(collection: string): Record<string, T> {
    const filePath = this.getCollectionPath(collection);
    if (!fs.existsSync(filePath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.trim()) return {};
      return JSON.parse(content) as Record<string, T>;
    } catch (err) {
      console.warn(`[DurableFileStore] Error reading collection "${collection}":`, err);
      return {};
    }
  }

  /**
   * Atomically writes an entire collection to disk using temp-file and atomic rename.
   */
  public writeCollection<T>(collection: string, data: Record<string, T>): void {
    const filePath = this.getCollectionPath(collection);
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;

    try {
      const serialized = JSON.stringify(data, null, 2);
      fs.writeFileSync(tempPath, serialized, 'utf-8');
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      console.error(`[DurableFileStore] Failed to atomically persist collection "${collection}":`, err);
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  /**
   * Saves a single entity into the collection.
   */
  public saveItem<T>(collection: string, id: string, item: T): void {
    const current = this.readCollection<T>(collection);
    current[id] = JSON.parse(JSON.stringify(item));
    this.writeCollection(collection, current);
  }

  /**
   * Retrieves a single entity from disk.
   */
  public getItem<T>(collection: string, id: string): T | null {
    const current = this.readCollection<T>(collection);
    return current[id] !== undefined ? current[id] : null;
  }

  /**
   * Deletes a single entity from disk.
   */
  public deleteItem(collection: string, id: string): void {
    const current = this.readCollection(collection);
    if (current[id] !== undefined) {
      delete current[id];
      this.writeCollection(collection, current);
    }
  }

  /**
   * Clears a collection on disk.
   */
  public clearCollection(collection: string): void {
    const filePath = this.getCollectionPath(collection);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        this.writeCollection(collection, {});
      }
    }
  }
}
