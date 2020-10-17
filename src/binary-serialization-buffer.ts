interface BinarySerializationBufferSlot {
    state: SlotState;
    bytes: Uint8Array | null;
    pos: number; // the position of the next available byte
    capacity: number;
}

const enum SlotState {
    Filling,
    Ready,
    Consumed,
}

export class BinarySerializationBuffer {
    constructor(
        public readonly onProgress?: (chunk: Uint8Array) => void,
        public readonly freeSlotOnProgress?: boolean,
    ) {}

    public readonly slots: BinarySerializationBufferSlot[] = [
        {
            state: SlotState.Filling,
            bytes: new Uint8Array(512),
            pos: 0,
            capacity: 512,
        },
    ];

    private currentSlotId = 0;
    private lastSentSlotId = -1;
    private lastAllocatedSize = 512; // in bytes

    private currentSlot(): BinarySerializationBufferSlot {
        return this.slots[this.currentSlotId];
    }

    /**
     * Allocate a new slot.
     * @param minSize If specified, the size of the new slot is not less than it.
     */
    private allocateNewSlot(minSize?: number): void {
        const slotCommonMaxSize = 1024 * 1024; // 1MB

        let size = this.lastAllocatedSize * 2;
        size = Math.min(size, slotCommonMaxSize);
        if (minSize) {
            while (size < minSize) {
                size *= 2;
            }
        }
        this.lastAllocatedSize = size;

        this.currentSlotId++;
        this.slots[this.currentSlotId] = {
            state: SlotState.Filling,
            bytes: new Uint8Array(size),
            pos: 0,
            capacity: size,
        };
    }

    /**
     * Allocate a new empty slot.
     */
    private allocateEmptySlot(): void {
        this.currentSlotId++;
        this.slots[this.currentSlotId] = {
            state: SlotState.Filling,
            bytes: null,
            pos: 0,
            capacity: 0,
        };
    }

    private nextSlotToSend(): BinarySerializationBufferSlot | undefined {
        return this.slots[this.lastSentSlotId + 1];
    }

    private aSlotGetsReady() {
        if (!this.onProgress) return;

        let slot: BinarySerializationBufferSlot | undefined;
        while (
            (slot = this.nextSlotToSend()) &&
            slot.state === SlotState.Ready
        ) {
            this.lastSentSlotId++;
            slot.state = SlotState.Consumed;
            this.onProgress(slot.bytes!);

            if (this.freeSlotOnProgress) {
                slot.bytes = null;
            }
        }
    }

    /**
     * Fill an empty slot that has been already allocated.
     */
    public fill(slotId: number, value: number[] | Uint8Array): void {
        const slot = this.slots[slotId];

        console.assert(
            slot.bytes === null,
            'Error: BinarySerializationBuffer.fill()',
        );

        if (Array.isArray(value)) {
            slot.bytes = new Uint8Array(value);
        } else {
            slot.bytes = value;
        }
        slot.state = SlotState.Ready;
        slot.pos = slot.capacity = value.length;
        this.aSlotGetsReady();
    }

    /**
     * End the current slot in advance. Because there may be unused memory space
     * in the slot, a new Uint8Array instance is generated to refer to a narrower
     * memory range.
     *
     * `bytes` and `capacity` is modified.
     */
    private endCurrentSlot(): void {
        const slot = this.currentSlot();
        const bytes = slot.bytes!;
        const reducedBytes = new Uint8Array(
            bytes.buffer,
            bytes.byteOffset,
            slot.pos,
        );
        slot.bytes = reducedBytes;
        slot.capacity = slot.pos;
    }

    public put(chunk: number[] | Uint8Array): void {
        let slot = this.currentSlot();
        console.assert(slot.state === SlotState.Filling);
        console.assert(slot.bytes instanceof Uint8Array);

        if (Array.isArray(chunk)) {
            if (chunk.length <= slot.capacity - slot.pos) {
                slot.bytes!.set(chunk, slot.pos);
                slot.pos += chunk.length;
            } else {
                const rest = chunk.splice(slot.capacity - slot.pos);
                const restLength = rest.length;

                slot.bytes!.set(chunk, slot.pos);
                slot.pos = slot.capacity;
                slot.state = SlotState.Ready;
                this.aSlotGetsReady();

                this.allocateNewSlot(restLength);
                slot = this.currentSlot();
                slot.bytes!.set(rest, 0);
                slot.pos += restLength;
            }
            return;
        }

        // If chunk is larger than `maxCopySize`, then do not copy it.
        // Instead, allocate a new slot to reference it.
        const maxCopySize = 16 * 1024; // 16KB

        if (chunk.length < maxCopySize) {
            if (chunk.length <= slot.capacity - slot.pos) {
                slot.bytes!.set(chunk, slot.pos);
                slot.pos += chunk.length;
            } else {
                const rest = chunk.subarray(slot.capacity - slot.pos);
                const restLength = rest.length;
                chunk = chunk.subarray(0, slot.capacity - slot.pos);

                slot.bytes!.set(chunk, slot.pos);
                slot.pos = slot.capacity;
                slot.state = SlotState.Ready;
                this.aSlotGetsReady();

                this.allocateNewSlot(restLength);
                slot = this.currentSlot();
                slot.bytes!.set(rest, 0);
                slot.pos += restLength;
            }
            return;
        }

        // chunk is very large

        this.endCurrentSlot();
        slot.state = SlotState.Ready;
        this.aSlotGetsReady();

        this.allocateEmptySlot();
        slot = this.currentSlot();
        slot.bytes = chunk;
        slot.pos = slot.capacity = chunk.length;
        slot.state = SlotState.Ready;
        this.aSlotGetsReady();

        this.allocateNewSlot();
    }

    /**
     * Declare that there won't be any new input.
     */
    public end(): void {
        const slots = this.slots;
        const len = slots.length;
        for (let i = 0; i < len; ++i) {
            console.assert(slots[i].bytes !== null);
        }

        const slot = this.currentSlot();
        if (slot.state === SlotState.Filling) {
            this.endCurrentSlot();
            slot.state = SlotState.Ready;
            this.aSlotGetsReady();
        }
    }
}
