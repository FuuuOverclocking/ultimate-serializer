import { isDOMNode, TypedArray } from './env';
import { DataType, SerializeOptions, SerializeReturn } from './types';
import { clamp, ArraySet } from './util';

class SerializationTemporaryResult {
    public slots: string[] | Uint8Array[] = [];
    constructor(private isString: boolean) {}

    private currentSlotId = 0;
    private currentSlotPtr = 0; // for binary only, points to the next available memory location
    private currentSlotCapacity = 0; // for binary only

    private lastAllocatedSize = 0;

    // for binary only
    private currentSlot(slot?: Uint8Array): Uint8Array | undefined {
        return slot
            ? (this.slots[this.currentSlotId] = slot)
            : (this.slots[this.currentSlotId] as Uint8Array | undefined);
    }

    /**
     * Allocate a new slot.
     * @param minSize If specified, the size of the new slot is not less than it.
     */
    private allocateNewSlot(minSize?: number): void {
        if (this.isString) {
            console.assert(
                this.slots[this.currentSlotId] === void 0,
                'Error: allocateNewSlot: isString = true && currentSlot() !== undefined',
            );
            this.slots[this.currentSlotId] = '';
            return;
        }

        const slotMinSize = 512;
        const slotGeneralMaxSize = 1024 * 1024; // 1MB

        let size = this.lastAllocatedSize * 2;
        size = clamp(size, slotMinSize, slotGeneralMaxSize);
        if (minSize) {
            while (size < minSize) {
                size *= 2;
            }
        }
        this.lastAllocatedSize = size;

        this.currentSlotPtr = 0;
        this.currentSlotCapacity = size;

        if (this.currentSlot()) {
            this.currentSlotId++;
        }
        this.slots[this.currentSlotId] = new Uint8Array(size);
    }

    /**
     * Reserve an empty slot and return its ID.
     *
     * - `currentSlotId` will be equal to `returnValue + 1`.
     * - `currentSlotPtr` and `currentSlotCapacity` will be set to 0.
     */
    private allocateEmptySlot(): number {
        this.currentSlotPtr = 0;
        this.currentSlotCapacity = 0;

        if (this.currentSlot() === void 0) {
            return this.currentSlotId++;
        }

        this.currentSlotId += 2;
        return this.currentSlotId - 1;
    }

    /**
     * Fill an empty slot that has been already allocated.
     */
    public fill(
        slotId: number,
        slotValue: string | number[] | Uint8Array,
    ): void {
        if (this.isString) {
            this.slots[slotId] = slotValue as string;
            return;
        }

        if (Array.isArray(slotValue)) {
            this.slots[slotId] = new Uint8Array(slotValue as number[]);
            return;
        }

        this.slots[slotId] = slotValue as Uint8Array;
    }

    /**
     * End the current slot in advance. Because there may be unused memory space
     * in the slot, a new Uint8Array instance is generated to refer to a narrower
     * memory range.
     */
    private finishCurrentSlot(): void {
        const slot = this.slots[this.currentSlotId] as Uint8Array;
        const reducedSlot = new Uint8Array(
            slot.buffer,
            slot.byteOffset,
            this.currentSlotPtr,
        );
        this.currentSlot(reducedSlot);
    }

    public input(chunk: string | number[] | Uint8Array): void {
        if (this.isString) {
            if (this.slots[this.currentSlotId] === void 0) {
                this.allocateNewSlot();
            }
            this.slots[this.currentSlotId] += chunk as string;
            return;
        }

        if (Array.isArray(chunk)) {
            if (this.currentSlot() === void 0) {
                this.allocateNewSlot(chunk.length);
            }

            if (
                chunk.length <=
                this.currentSlotCapacity - this.currentSlotPtr
            ) {
                this.currentSlot()!.set(chunk, this.currentSlotPtr);
                this.currentSlotPtr += chunk.length;
            } else {
                const rest = chunk.splice(
                    this.currentSlotCapacity - this.currentSlotPtr,
                );
                const restLength = rest.length;

                if (chunk.length)
                    this.currentSlot()!.set(chunk, this.currentSlotPtr);

                this.allocateNewSlot(restLength);
                this.currentSlot()!.set(rest, 0);
                this.currentSlotPtr = restLength;
            }
            return;
        }

        // If chunk is larger than `maxCopySize`, then do not copy it.
        // Instead, allocate a new slot to reference it.
        const maxCopySize = 32 * 1024; // 32KB

        if ((chunk as Uint8Array).length < maxCopySize) {
            if (!this.currentSlot()) {
                this.allocateNewSlot((chunk as Uint8Array).length);
            }

            if (
                (chunk as Uint8Array).length <=
                this.currentSlotCapacity - this.currentSlotPtr
            ) {
                this.currentSlot()!.set(
                    chunk as Uint8Array,
                    this.currentSlotPtr,
                );
                this.currentSlotPtr += chunk.length;
            } else {
                const rest = (chunk as Uint8Array).subarray(
                    this.currentSlotCapacity - this.currentSlotPtr,
                );
                const restLength = rest.length;

                chunk = (chunk as Uint8Array).subarray(
                    0,
                    this.currentSlotCapacity - this.currentSlotPtr,
                );

                if (chunk.length) {
                    this.currentSlot()!.set(chunk, this.currentSlotPtr);
                }

                this.allocateNewSlot(restLength);
                this.currentSlot()!.set(rest, 0);
                this.currentSlotPtr = restLength;
            }
            return;
        }

        // chunk is large

        if (this.currentSlot()) {
            this.finishCurrentSlot();
        }

        const slotId = this.allocateEmptySlot();
        this.slots[slotId] = chunk as Uint8Array;
    }

    /**
     * Tell the object that there won't be any new input.
     */
    public end(): void {
        const slots = this.slots;
        const len = slots.length;
        for (let i = 0; i < len; ++i) {
            console.assert(
                slots[i] !== void 0,
                'Error: SerializationTemporaryResult.end: empty slot found.',
            );
        }
        if (!this.isString && this.currentSlot()) {
            this.finishCurrentSlot();
        }
    }
}

export class Serialization {
    constructor(
        public readonly source: any,
        public readonly options: SerializeOptions,
    ) {}

    private objects = new ArraySet();

    private tmpResult = new SerializationTemporaryResult(
        this.options.target === 'string',
    );

    public getResult(): SerializeReturn {
        this.render(this.source);
        return '';
    }
    private render(data: any): void {
        switch (typeof data) {
            case 'undefined':
                this.putUndefined();
                break;
            case 'boolean':
                this.putBoolean(data);
                break;
            case 'number':
                this.renderNumber(data);
                break;
            case 'string':
                this.renderString(data);
                break;
            case 'bigint':
                this.renderBigInt(data);
                break;

            // Unsupported
            case 'symbol':
            case 'function':
                if (this.options.forUnsupported === 'error') {
                    throw new Error(
                        'serialize-structured-data: Cannot serialize' +
                            'symbol or function. To avoid it, set' +
                            'options.forUnsupported to "avoid".',
                    );
                }
                break;

            // Referencable Type, except `null`
            case 'object':
                if (data === null) {
                    this.putNull();
                    break;
                }

                const type = Object.prototype.toString.call(data);
                if (type === '[object Object]') {
                    this.renderObject(data);
                    break;
                }
                if (type === '[object Array]') {
                    this.renderArray(data);
                    break;
                }

                if (data instanceof Boolean) {
                    this.putBooleanObject(data);
                    break;
                }
                if (data instanceof Number) {
                    this.renderNumberObject(data);
                    break;
                }
                if (type === '[object BigInt]') {
                    this.renderBigIntObject(data);
                    break;
                }
                if (data instanceof String) {
                    this.renderStringObject(data);
                    break;
                }
                if (data instanceof Date) {
                    this.renderDateObject(data);
                    break;
                }
                if (data instanceof RegExp) {
                    this.renderRegExp(data);
                    break;
                }
                if (type === '[object ArrayBuffer]') {
                    this.renderArrayBuffer(data);
                    break;
                }
                if (type === '[object DataView]') {
                    this.renderDataView(data);
                    break;
                }
                if (TypedArray && data instanceof TypedArray) {
                    this.renderTypedArray(data);
                    break;
                }
                if (type === '[object Map]') {
                    this.renderMap(data);
                    break;
                }
                if (type === '[object Set]') {
                    this.renderSet(data);
                    break;
                }
                if (data instanceof Error) {
                    this.renderError(data);
                    break;
                }
                if (type === '[object Blob]') {
                    if (!this.options.allowBlobAndFile) {
                        throw new Error(
                            'To serialize Blob, you must set ' +
                                'options.allowBlobAndFile to true.',
                        );
                    }
                    this.renderBlob(data);
                    break;
                }
                if (type === '[object File]') {
                    if (!this.options.allowBlobAndFile) {
                        throw new Error(
                            'To serialize File, you must set ' +
                                'options.allowBlobAndFile to true.',
                        );
                    }
                    this.renderFile(data);
                    break;
                }
                if (type === '[object ImageData]') {
                    if (!this.options.allowImageData) {
                        throw new Error(
                            'To serialize ImageData, you must set ' +
                                'options.allowBlobAndFile to true.',
                        );
                    }
                    this.renderImageData(data);
                    break;
                }
                if (
                    isDOMNode(data) ||
                    type === '[object Promise]' ||
                    type === '[object WeakRef]' ||
                    type === '[object WeakMap]' ||
                    type === '[object WeakSet]' ||
                    type === '[object FileList]' ||
                    type === '[object ImageBitmap]'
                ) {
                    if (this.options.forUnsupported === 'error') {
                        throw new Error(
                            'serialize-structured-data: Cannot serialize ' +
                                'DOM Node, Promise, WeakRef, WeakMap, ' +
                                'WeakSet, FileList or ImageBitmap. ' +
                                'To avoid it, set ' +
                                'options.forUnsupported to "avoid".',
                        );
                    }
                    break;
                }
        }
    }
}
