export class ArraySet<T = any> {
    private readonly arr: T[] = [];
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
export const isInteger =
    Number.isInteger ||
    ((value: number): boolean => {
        return isFinite(value) && Math.floor(value) === value;
    });
