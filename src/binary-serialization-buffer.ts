import { assert, clamp } from './utilities';

export class BinarySerializationBuffer {
    constructor(
        private parent: BinarySerializationBuffer | undefined = void 0,
    ) {}

    public ready = false;
    private ended = false;
    private notReadySubBufferNum = 0;

    private slots: Array<Uint8Array | BinarySerializationBuffer> = [];

    private currentSlotId = 0;
    private currentSlot(): Uint8Array | undefined {
        return this.slots[this.currentSlotId] as Uint8Array | undefined;
    }
    private currentSlotPos = 0; // the position of the next available byte of the current slot
    private currentSlotCap = 0; // the capacity of the current slot
    private lastAllocatedSize = 0; // in bytes

    public putSubBuffer(): BinarySerializationBuffer {
        assert(!this.ended);

        this.endCurrentSlotIfExists();
        this.notReadySubBufferNum++;
        const buf = new BinarySerializationBuffer(this);
        this.slots.push(buf);
        this.currentSlotId = this.slots.length;
        this.currentSlotPos = 0;
        this.currentSlotCap = 0;
        return buf;
    }

    private onSubBufferReady(): void {
        assert(!this.ready);
        assert(this.notReadySubBufferNum > 0);

        this.notReadySubBufferNum--;
        this.ready = this.ended && this.notReadySubBufferNum === 0;
        if (this.ready && this.parent) {
            this.parent.onSubBufferReady();
        }
    }

    public extract(): Uint8Array[] {
        assert(this.ready);

        const result: Uint8Array[] = [];
        for (const slot of this.slots) {
            if (slot instanceof BinarySerializationBuffer) {
                result.push(...slot.extract());
            } else {
                result.push(slot);
            }
        }
        return result;
    }

    private endCurrentSlotIfExists(): void {
        const slot = this.currentSlot();
        if (!slot) return;

        const reducedSlot = new Uint8Array(
            slot.buffer,
            slot.byteOffset,
            this.currentSlotPos,
        );
        this.currentSlotCap = this.currentSlotPos;
        this.slots[this.currentSlotId] = reducedSlot;
    }

    /**
     * Allocate a new slot of Uint8Array type.
     * @param minSize If specified, the size of the new slot is not less than it.
     */
    private allocateNewSlot(minSize?: number): void {
        const slotMinSize = 512; // 512B
        const slotCommonMaxSize = 1024 * 1024; // 1MB

        let size = this.lastAllocatedSize * 2;
        size = clamp(size, slotMinSize, slotCommonMaxSize);
        if (minSize) {
            while (size < minSize) {
                size *= 2;
            }
        }
        this.lastAllocatedSize = size;

        this.slots.push(new Uint8Array(size));
        this.currentSlotId = this.slots.length - 1;
        this.currentSlotPos = 0;
        this.currentSlotCap = size;
    }

    public end(): void {
        this.endCurrentSlotIfExists();
        this.ended = true;
        this.ready = this.notReadySubBufferNum === 0;
        if (this.ready && this.parent) {
            this.parent.onSubBufferReady();
        }
    }

    public put(chunk: number[] | Uint8Array): void {
        const isArray = Array.isArray(chunk);
        const maxCopySize = 16 * 1024; // 16KB

        // chunk is very large
        if (!isArray && chunk.length >= maxCopySize) {
            this.endCurrentSlotIfExists();
            this.slots.push(chunk as Uint8Array);
            this.currentSlotId = this.slots.length;
            this.currentSlotPos = 0;
            this.currentSlotCap = 0;
            return;
        }

        let slot = this.currentSlot();
        if (!slot) {
            this.allocateNewSlot();
            slot = this.currentSlot()!;
        }

        const currentSlotFreeSpace = this.currentSlotCap - this.currentSlotPos;

        if (chunk.length <= currentSlotFreeSpace) {
            slot.set(chunk, this.currentSlotPos);
            this.currentSlotPos += chunk.length;
            return;
        }

        let part1: number[] | Uint8Array;
        let part2: number[] | Uint8Array;
        if (isArray) {
            part1 = chunk;
            part2 = (part1 as number[]).splice(currentSlotFreeSpace);
        } else {
            part1 = (chunk as Uint8Array).subarray(0, currentSlotFreeSpace);
            part2 = (chunk as Uint8Array).subarray(currentSlotFreeSpace);
        }

        slot.set(part1, this.currentSlotPos);

        this.allocateNewSlot();
        slot = this.currentSlot()!;
        slot.set(part2, 0);
        this.currentSlotPos = part2.length;
    }
}
