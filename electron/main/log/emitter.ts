// electron/main/log/emitter.ts — operation log ring buffer + event emitter.
// Renderer subscribes via the log:subscribe / log:event channels.

import { EventEmitter } from 'node:events';
import type { LogEntry } from '@shared/git';

class LogStore extends EventEmitter {
  private buffer: LogEntry[] = [];
  private readonly max = 200;

  push(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.max) this.buffer.shift();
    this.emit('entry', entry);
  }

  snapshot(): readonly LogEntry[] {
    return this.buffer.slice();
  }
}

export const logStore = new LogStore();
