export class FifoQueue<T> {
  private readonly incoming: T[] = [];
  private readonly outgoing: T[] = [];

  get length(): number {
    return this.incoming.length + this.outgoing.length;
  }

  enqueue(value: T): void {
    this.incoming.push(value);
  }

  dequeue(): T | undefined {
    if (this.outgoing.length === 0) {
      while (this.incoming.length > 0) this.outgoing.push(this.incoming.pop()!);
    }
    return this.outgoing.pop();
  }

  clear(): void {
    this.incoming.length = 0;
    this.outgoing.length = 0;
  }
}
