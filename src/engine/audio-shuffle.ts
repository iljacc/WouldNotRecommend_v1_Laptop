export class ShuffleBag<T> {
  private bag: T[] = [];
  private last: T | undefined;

  constructor(
    private readonly items: readonly T[],
    private readonly random: () => number = Math.random,
  ) {}

  next(): T | undefined {
    if (this.items.length === 0) return undefined;
    if (this.bag.length === 0) this.refill();

    const value = this.bag.shift();
    this.last = value;
    return value;
  }

  private refill(): void {
    this.bag = [...this.items];
    for (let index = this.bag.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.random() * (index + 1));
      [this.bag[index], this.bag[swapIndex]] = [
        this.bag[swapIndex],
        this.bag[index],
      ];
    }

    if (this.bag.length > 1 && this.bag[0] === this.last) {
      [this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]];
    }
  }
}

export function randomBetween(
  min: number,
  max: number,
  random: () => number = Math.random,
): number {
  return min + (max - min) * random();
}

export function decibelsToGain(decibels: number): number {
  return 10 ** (decibels / 20);
}
