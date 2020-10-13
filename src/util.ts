export function clamp(value: number, min: number, max: number) {
    return value < min ? min : value > max ? max : value;
}

export class ArraySet<T = any> {
    private arr: T[] = [];
    public get(i: number): T | undefined {
        return this.arr[i];
    }
    public indexOf(elem: T): number {
        return this.arr.indexOf(elem);
    }
    public has(elem: T): boolean {
        return this.arr.indexOf(elem) !== -1;
    }
    public add(elem: T): this {
        if (!this.has(elem)) {
            this.arr.push(elem);
        }
        return this;
    }
}
