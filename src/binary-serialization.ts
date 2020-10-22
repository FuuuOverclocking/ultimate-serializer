import UltimateSerializer from '.';
import { _TextEncoder } from './environment';
import {
    BigIntTypeBits,
    BooleanTypeBits,
    DataType,
    NumberTypeBits,
    StringTypeBits,
    TypeDescriptor,
    version,
} from './types';
import {
    ArraySet,
    bigIntToBuffer,
    err,
    isInteger,
    values,
    warn,
} from './utilities';
import { BinarySerializationBuffer } from './binary-serialization-buffer';

const binarySerializationTargets = [
    'Uint8Array',
    'Uint8Array[]',
    'Promise<Uint8Array>',
    'Promise<Uint8Array[]>',
    'ReadableStream<Uint8Array>',
] as const;

type BinarySerializationTarget = typeof binarySerializationTargets[number];

const syncTargets = ['Uint8Array', 'Uint8Array[]'];

export function isBinarySerializationTarget(
    target: string,
): target is BinarySerializationTarget {
    return !!~binarySerializationTargets.indexOf(target as any);
}

function decideNumberTypeBits(data: number): NumberTypeBits {
    if (!isInteger(data)) return NumberTypeBits.Double;

    if (data >= 0) {
        if (data <= 255) return NumberTypeBits.Uint8;
        if (data <= 65535) return NumberTypeBits.Uint16;
        if (data <= 4294967295) return NumberTypeBits.Uint32;
        return NumberTypeBits.Double;
    }
    if (data >= -128) return NumberTypeBits.Int8;
    if (data >= -32768) return NumberTypeBits.Int16;
    if (data >= -2147483648) return NumberTypeBits.Int32;
    return NumberTypeBits.Double;
}

export class BinarySerialization {
    private readonly extraTypes: TypeDescriptor[] = [];
    private readonly usedExtraTypes = new ArraySet<TypeDescriptor>();
    private readonly referencables = new ArraySet<any>();
    private readonly buffer = new BinarySerializationBuffer();
    private readonly unresolvedPromiseNum = 0;

    private readonly forUnsupported: 'error' | 'warn' | 'avoid';
    private readonly preferUtf16: boolean;
    private readonly refineArrayBufferView:
        | boolean
        | Array<ArrayBuffer | ArrayBufferView>;

    constructor(inst: UltimateSerializer, private readonly data: any) {
        this.forUnsupported = inst.forUnsupported;
        this.preferUtf16 = inst.preferUtf16;
        this.refineArrayBufferView = inst.refineArrayBufferView;
        this.extraTypes = values(inst.extraTypes).filter(
            (td) => !!td.serialize,
        );
    }

    public evaluate(target: BinarySerializationTarget): any {
        this.putSerializationFormatVersion();
        this.render(this.data);
        this.putExtraTypeInfo();
        this.putEOF();

        // this.buffer.end();

        if (this.unresolvedPromiseNum > 0) {
            if (~syncTargets.indexOf(target)) {
                err(
                    'Cannot serialize the data synchronously. Try to change ' +
                        'target to Promise or ReadableStream.',
                );
            }
        }
    }

    private putHeader(type: DataType, typeBits: number = 0): void {
        this.buffer.put([type | typeBits]);
    }

    private putSerializationFormatVersion(): void {
        this.putHeader(DataType.SerializationFormatVersion);
        this.putNumber(version, true, NumberTypeBits.Uint8);
    }

    private putExtraTypeIfMatch(data: any): boolean {
        if (this.putReferIfExists(data)) return true;

        let matchedType: TypeDescriptor | undefined;
        let result: false | any[] | Promise<any[]> = false;
        for (const td of this.extraTypes) {
            result = td.serialize!(data);
            if (result) {
                matchedType = td;
                break;
            }
        }
        if (!result) return false;
        const typeId = this.useExtraType(matchedType!);
        this.putHeader(DataType.ExtraType);
        this.putNumber(typeId, true, NumberTypeBits.Uint8);
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
                this.putNumber(data);
                break;
            case 'string':
                this.putString(data, false, true);
                break;
            case 'bigint':
                this.putBigInt(data);
                break;

            case 'symbol':
                if (this.forUnsupported !== 'avoid') {
                    const msg =
                        'Cannot serialize symbol. To avoid it, set' +
                        'options.forUnsupported to "avoid".';
                    if (this.forUnsupported === 'error') err(msg);
                    else warn(msg);
                }
                break;

            case 'function':
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

                if (this.options.forUnsupported === 'error') {
                    throw new Error(
                        'serialize-structured-data: Cannot serialize ' +
                            'unknown platform object(' +
                            type +
                            ').',
                    );
                }
                break;
        }
    }

    private putUndefined(): void {
        this.putHeader(DataType.Undefined);
    }
    private putNull(): void {
        this.putHeader(DataType.Null);
    }
    private putBoolean(data: boolean): void {
        const typeBits = data ? BooleanTypeBits.True : BooleanTypeBits.False;
        this.putHeader(DataType.Boolean, typeBits);
    }
    private putNumber(
        data: number,
        omitType = false,
        typeBits?: NumberTypeBits,
    ): void {
        if (typeBits === void 0) {
            typeBits = decideNumberTypeBits(data);
        }
        if (!omitType) {
            this.putHeader(DataType.Number, typeBits);
        }
        let bytes: ArrayBufferView;
        const d = [data];
        switch (typeBits) {
            case NumberTypeBits.Int8:
                bytes = new Int8Array(d);
                break;
            case NumberTypeBits.Uint8:
                bytes = new Uint8Array(d);
                break;
            case NumberTypeBits.Int16:
                bytes = new Int16Array(d);
                break;
            case NumberTypeBits.Uint16:
                bytes = new Uint16Array(d);
                break;
            case NumberTypeBits.Int32:
                bytes = new Int32Array(d);
                break;
            case NumberTypeBits.Uint32:
                bytes = new Uint32Array(d);
                break;
            case NumberTypeBits.Double:
                bytes = new Float64Array(d);
                break;
            default:
                err('Here should be unreachable.');
        }
        this.buffer.put(new Uint8Array(bytes.buffer));
    }
    private putString(
        data: string,
        omitType = false,
        respectUserPrefer = false,
    ): void {
        const preferUtf16 = respectUserPrefer ? this.inst.preferUtf16 : false;
        if (!omitType) {
            const typeBits = preferUtf16
                ? StringTypeBits.Utf16
                : StringTypeBits.Utf8;
            this.putHeader(DataType.String, typeBits);
        }

        const strLength = data.length;
        let byteLength: number;

        if (preferUtf16) {
            byteLength = strLength * 2;
            this.putNumber(byteLength);

            const buf = new Uint16Array(strLength);
            for (let i = 0; i < strLength; ++i) {
                buf[i] = data.charCodeAt(i);
            }
            this.buffer.put(new Uint8Array(buf.buffer));
            return;
        }

        const encoder = new _TextEncoder();
        const utf8 = encoder.encode(data);
        byteLength = utf8.length;
        this.putNumber(byteLength);
        this.buffer.put(utf8);
    }
    private putBigInt(data: bigint): void {
        let typeBits: BigIntTypeBits;
        if (data < 0) {
            data = -data;
            typeBits = BigIntTypeBits.Negative;
        } else {
            typeBits = BigIntTypeBits.Positive;
        }
        this.putHeader(DataType.BigInt, typeBits);
        const buf = bigIntToBuffer(data);
        this.putArrayBuffer(buf.buffer, true);
    }

    /**
     * @returns Is it existent?
     */
    private putReferIfExists(referencable: any): boolean {
        const index = this.referencables.indexOf(referencable);
        if (!~index) return false;

        this.putRefer(index);
        return true;
    }
    private putRefer(index: number) {
        this.putHeader(DataType.Refer);
        this.putNumber(index);
    }

    private putEOF(): void {
        this.putHeader(DataType.EOF);
    }

    private useExtraType(td: TypeDescriptor): number {
        return this.usedExtraTypes.addAndGetIndex(td);
    }

    private putExtraTypeInfo(): void {
        const arr = this.usedExtraTypes.arr.map((td) => td.type);
        this.putHeader(DataType.ExtraTypeInfo);
        this.putArray(arr, true);
    }

    private putArray(data: any[], omitType = false): void {
        // If the type byte is to be omitted, then we cannot replace the array
        // with a reference or add the array to the record of referencables.
        if (!omitType) {
            if (this.putReferIfExists(data)) return;
            this.referencables.addAndGetIndex(data);
            this.putHeader(DataType.Array);
        }

        const len = data.length;
        this.putNumber(len, true, NumberTypeBits.Uint32);

        let continuousEmptySlotNum = 0;
        for (let i = 0; i < len; ++i) {
            // is empty slot?
            if (!(i in data)) {
                continuousEmptySlotNum++;
                continue;
            }
            if (continuousEmptySlotNum > 0) {
                this.putArrayEmptySlots(continuousEmptySlotNum);
                continuousEmptySlotNum = 0;
            }
            this.render(data[i]);
        }
        if (continuousEmptySlotNum > 0) {
            this.putArrayEmptySlots(continuousEmptySlotNum);
        }
    }

    private putArrayEmptySlots(num: number): void {
        this.putHeader(DataType.ArrayEmptySlots);
        this.putNumber(num, true, NumberTypeBits.Uint32);
    }

    private putObject(data: any): void {
        if (this.putReferIfExists(data)) return;
        this.referencables.addAndGetIndex(data);
        this.putHeader(DataType.Object);

        const keys = Object.keys(data);
        const len = keys.length;
        this.putNumber(len, true, NumberTypeBits.Uint32);

        for (let i = 0; i < len; ++i) {
            const key = keys[i];
            this.putString(key, true);
            this.render(data[key]);
        }
    }

    private putSet(data: Set<any>): void {
        if (this.putReferIfExists(data)) return;
        this.referencables.addAndGetIndex(data);
        this.putHeader(DataType.Set);

        const size = data.size;
        this.putNumber(size, true, NumberTypeBits.Uint32);
        data.forEach((val) => {
            this.render(val);
        });
    }

    private putMap(data: Map<any, any>): void {
        if (this.putReferIfExists(data)) return;
        this.referencables.addAndGetIndex(data);
        this.putHeader(DataType.Map);

        const size = data.size;
        this.putNumber(size, true, NumberTypeBits.Uint32);
        data.forEach((val, key) => {
            this.render(key);
            this.render(val);
        });
    }

    private putArrayBuffer(data: ArrayBuffer, omitType = false): void {
        // If the type byte is to be omitted, then we cannot replace the arraybuffer
        // with a reference or add the arraybuffer to the record of referencables.
        if (!omitType) {
            if (this.putReferIfExists(data)) return;
            this.referencables.addAndGetIndex(data);
            this.putHeader(DataType.ArrayBuffer);
        }
    }
}
