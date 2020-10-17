import UltimateSerializer from '.';
import { BinarySerializationBuffer } from './binary-serialization-buffer';
import { ArraySet } from './utilities';

const binarySerializationTargets = [
    'Uint8Array',
    'Uint8Array[]',
    'Promise<Uint8Array>',
    'Promise<Uint8Array[]>',
    'ReadableStream<Uint8Array>',
] as const;

type BinarySerializationTarget = typeof binarySerializationTargets[number];

export function isBinarySerializationTarget(
    target: string,
): target is BinarySerializationTarget {
    return binarySerializationTargets.indexOf(target as any) !== -1;
}

export class BinarySerialization {
    constructor(
        private readonly inst: UltimateSerializer,
        private readonly data: any,
    ) {}

    private readonly referencables = new ArraySet();
    private readonly buffer = new BinarySerializationBuffer();

    public evaluate(target: BinarySerializationTarget): any {}

    private render(data: any): void {}
}
