import UltimateSerializer from '.';
import {
    ArrayBufferViewType,
    BigIntTypeBits,
    BooleanTypeBits,
    DataType,
    ErrorTypeBits,
    NumberTypeBits,
    StringTypeBits,
    TypeDescriptor,
} from './types';
import { TypedArray, _TextEncoder } from './environment';
import {
    ArraySet,
    assert,
    bigIntToBuffer,
    err,
    isInteger,
    isPlainObject,
    values,
    warn,
} from './utilities';
import { BinarySerializationBuffer } from './binary-serialization-buffer';

const binarySerializationFormatVersion = 1;

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

/**
 * Serializes the data to the specified binary target according to the options.
 * This is a class of disposable objects.
 */
export class BinarySerialization {
    private readonly forUnsupported: 'error' | 'warn' | 'avoid';
    private readonly extraTypes: TypeDescriptor[] = [];
    private readonly preferUTF16: boolean;
    private readonly refineArrayBufferView:
        | boolean
        | Array<ArrayBuffer | ArrayBufferView>;

    private unresolvedPromiseNum = 0;
    private readonly usedExtraTypes = new ArraySet<TypeDescriptor>();
    private readonly referencables = new ArraySet<any>();
    private buffer = new BinarySerializationBuffer();
    private bufferExtraTypeInfo: BinarySerializationBuffer | undefined;
    private resolveTopPromise: undefined | (() => void);

    constructor(inst: UltimateSerializer, private readonly data: any) {
        this.forUnsupported = inst.options.forUnsupported;
        this.extraTypes = values(inst.extraTypes).filter(
            (td) => !!td.serialize,
        );
        this.preferUTF16 = inst.options.serializing.preferUTF16;
        this.refineArrayBufferView =
            inst.options.serializing.refineArrayBufferView;
    }

    public evaluate(target: BinarySerializationTarget): any {
        this.putSerializationFormatVersion();
        this.render(this.data);
        this.bufferExtraTypeInfo = this.buffer.putSubBuffer();
        this.putEOF();
        this.buffer.end();

        if (this.unresolvedPromiseNum === 0) {
            this.execWithBuffer(this.bufferExtraTypeInfo!, () => {
                this.putExtraTypeInfo();
                this.buffer.end();
            });

            assert(this.buffer.ready);

            const result = this.buffer.extract();
            if (target === 'Uint8Array[]') return result;
            else if (target === 'Promise<Uint8Array[]>')
                return Promise.resolve(result);
            else if (
                target === 'Uint8Array' ||
                target === 'Promise<Uint8Array>'
            ) {
                let size = 0;
                for (const part of result) {
                    size += part.length;
                }
                const merged = new Uint8Array(size);
                size = 0;
                for (const part of result) {
                    merged.set(part, size);
                    size += part.length;
                }
                if (target === 'Uint8Array') return merged;
                else return Promise.resolve(merged);
            } else {
                const stream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        for (const part of result) {
                            controller.enqueue(part);
                        }
                    },
                });
                return stream;
            }
        }

        if (~syncTargets.indexOf(target)) {
            err(
                'Cannot serialize the given data synchronously. Set ' +
                    'target to Promise or ReadableStream to get the result.',
            );
        }

        const topPromise = new Promise<void>((resolve) => {
            this.resolveTopPromise = resolve;
        });

        if (target === 'Promise<Uint8Array[]>') {
            return topPromise.then(() => this.buffer.extract());
        }
        if (target === 'Promise<Uint8Array>') {
            return topPromise.then(() => {
                const result = this.buffer.extract();

                let size = 0;
                for (const part of result) {
                    size += part.length;
                }
                const merged = new Uint8Array(size);
                size = 0;
                for (const part of result) {
                    merged.set(part, size);
                    size += part.length;
                }
                return merged;
            });
        }
        if (target === 'ReadableStream<Uint8Array>') {
            const buffer = this.buffer;
            return new ReadableStream<Uint8Array>({
                start(controller) {
                    topPromise.then(() => {
                        for (const part of buffer.extract()) {
                            controller.enqueue(part);
                        }
                    });
                },
            });
        }
    }

    public onAsyncComplete(): void {
        assert(this.unresolvedPromiseNum === 0);

        // 1. Put ExtraTypeInfo of all extra types used during serialization.
        this.execWithBuffer(this.bufferExtraTypeInfo!, () => {
            this.putExtraTypeInfo();
            this.buffer.end();
        });

        // 2. The buffer should be ready at this moment.
        assert(this.buffer.ready);

        // 3. Resolve topPromise, so that the promise or stream returned
        //    by `evaluate` starts loading content.
        this.resolveTopPromise!();
    }

    private execWithBuffer(buf: BinarySerializationBuffer, func: () => void) {
        const saveBuffer = this.buffer;
        this.buffer = buf;
        func();
        this.buffer = saveBuffer;
    }

    private putHeader(type: DataType, typeBits: number = 0): void {
        this.buffer.put([type | typeBits]);
    }

    private putSerializationFormatVersion(): void {
        this.putHeader(DataType.SerializationFormatVersion);
        this.putNumber(
            binarySerializationFormatVersion,
            true,
            NumberTypeBits.Uint8,
        );
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
                if (!this.putExtraTypeIfMatch(data)) {
                    if (this.forUnsupported !== 'avoid') {
                        const msg =
                            'Cannot serialize functions. To avoid it, set ' +
                            'options.forUnsupported to "avoid". To add ' +
                            'support for functions, define an extra type for it.';
                        if (this.forUnsupported === 'error') err(msg);
                        else warn(msg);
                    }
                }
                break;

            // Referencable Type, except `null`
            case 'object':
                if (data === null) {
                    this.putNull();
                    break;
                }

                if (this.putExtraTypeIfMatch(data)) break;

                if (Array.isArray(data)) {
                    this.putArray(data);
                    break;
                }
                if (isPlainObject(data)) {
                    this.putObject(data);
                    break;
                }

                const type = Object.prototype.toString.call(data);

                if (TypedArray && data instanceof TypedArray) {
                    this.putTypedArray(data);
                    break;
                }

                switch (type) {
                    case '[object Set]':
                        this.putSet(data);
                        break;
                    case '[object Map]':
                        this.putMap(data);
                        break;
                    case '[object ArrayBuffer]':
                        this.putArrayBuffer(data);
                        break;
                    case '[object DataView]':
                        this.putDataView(data);
                        break;
                    case '[object Error]':
                        this.putError(data);
                        break;
                    case '[object Date]':
                        this.putDate(data);
                        break;
                    case '[object RegExp]':
                        this.putRegExp(data);
                        break;
                    case '[object Boolean]':
                        this.putBooleanObject(data);
                        break;
                    case '[object Number]':
                        this.putNumberObject(data);
                        break;
                    case '[object BigInt]':
                        this.putBigIntObject(data);
                        break;
                    case '[object String]':
                        this.putStringObject(data);
                        break;
                    default:
                        if (this.forUnsupported !== 'avoid') {
                            const msg =
                                `Cannot serialize ${type}. To avoid it, set` +
                                `options.forUnsupported to "avoid". To add ` +
                                `support for ${type}, define an extra type for it.`;
                            if (this.forUnsupported === 'error') err(msg);
                            else warn(msg);
                        }
                }
        }
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

        this.referencables.addAndGetIndex(data);

        const typeId = this.useExtraType(matchedType!);

        this.putHeader(DataType.ExtraType);
        this.putNumber(typeId, true, NumberTypeBits.Uint16);

        if (Array.isArray(result)) {
            this.putArray(result, true);
        } else {
            this.unresolvedPromiseNum++;
            const bufResult = this.buffer.putSubBuffer();

            result.then((_result) => {
                this.execWithBuffer(bufResult, () => {
                    this.putArray(_result, true);
                    this.buffer.end();
                });

                this.unresolvedPromiseNum--;
                if (this.unresolvedPromiseNum === 0) {
                    this.onAsyncComplete();
                }
            });
        }

        return true;
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
        const preferUtf16 = respectUserPrefer ? this.preferUTF16 : false;
        if (!omitType) {
            const typeBits = preferUtf16
                ? StringTypeBits.UTF16
                : StringTypeBits.UTF8;
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
        if (arr.length) {
            this.putHeader(DataType.ExtraTypeInfo);
            this.putArray(arr, true);
        }
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
        this.putNumber(len);

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
        this.putNumber(num);
    }

    private putObject(data: any): void {
        if (this.putReferIfExists(data)) return;
        this.referencables.addAndGetIndex(data);
        this.putHeader(DataType.Object);

        const keys = Object.keys(data);
        const len = keys.length;
        this.putNumber(len);

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
        this.putNumber(size);
        data.forEach((val) => {
            this.render(val);
        });
    }

    private putMap(data: Map<any, any>): void {
        if (this.putReferIfExists(data)) return;
        this.referencables.addAndGetIndex(data);
        this.putHeader(DataType.Map);

        const size = data.size;
        this.putNumber(size);
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

        this.putNumber(data.byteLength, true, NumberTypeBits.Double);
        this.buffer.put(new Uint8Array(data));
    }

    private putDataView(data: DataView): void {
        assert(!this.refineArrayBufferView);

        if (!this.refineArrayBufferView) {
            if (this.putReferIfExists(data)) return;
            this.referencables.addAndGetIndex(data);

            this.putHeader(DataType.ArrayBufferView);
            this.buffer.put([ArrayBufferViewType.DataView]);
            this.putNumber(data.byteLength, true, NumberTypeBits.Double);
            this.putNumber(data.byteOffset, true, NumberTypeBits.Double);
            this.putArrayBuffer(data.buffer);
        }
    }

    private putTypedArray(data: ArrayBufferView): void {
        assert(!this.refineArrayBufferView);

        if (!this.refineArrayBufferView) {
            if (this.putReferIfExists(data)) return;
            this.referencables.addAndGetIndex(data);

            this.putHeader(DataType.ArrayBufferView);
            switch (data.constructor.name) {
                case 'Int8Array':
                    this.buffer.put([ArrayBufferViewType.Int8Array]);
                    break;
                case 'Uint8Array':
                    this.buffer.put([ArrayBufferViewType.Uint8Array]);
                    break;
                case 'Uint8ClampedArray':
                    this.buffer.put([ArrayBufferViewType.Uint8ClampedArray]);
                    break;
                case 'Int16Array':
                    this.buffer.put([ArrayBufferViewType.Int16Array]);
                    break;
                case 'Uint16Array':
                    this.buffer.put([ArrayBufferViewType.Uint16Array]);
                    break;
                case 'Int32Array':
                    this.buffer.put([ArrayBufferViewType.Int32Array]);
                    break;
                case 'Uint32Array':
                    this.buffer.put([ArrayBufferViewType.Uint32Array]);
                    break;
                case 'Float32Array':
                    this.buffer.put([ArrayBufferViewType.Float32Array]);
                    break;
                case 'Float64Array':
                    this.buffer.put([ArrayBufferViewType.Float64Array]);
                    break;
                case 'BigInt64Array':
                    this.buffer.put([ArrayBufferViewType.BigInt64Array]);
                    break;
                case 'BigUint64Array':
                    this.buffer.put([ArrayBufferViewType.BigUint64Array]);
                    break;
            }
            this.putNumber(data.byteOffset, true, NumberTypeBits.Double);
            this.putNumber((data as any).length, true, NumberTypeBits.Double);
            this.buffer.put(
                new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
            );
        }
    }

    private putError(data: Error): void {
        if (this.putReferIfExists(data)) return;
        this.referencables.addAndGetIndex(data);

        let typeBits: ErrorTypeBits;

        switch (data.name) {
            case 'EvalError':
                typeBits = ErrorTypeBits.EvalError;
                break;
            case 'RangeError':
                typeBits = ErrorTypeBits.RangeError;
                break;
            case 'ReferenceError':
                typeBits = ErrorTypeBits.ReferenceError;
                break;
            case 'SyntaxError':
                typeBits = ErrorTypeBits.SyntaxError;
                break;
            case 'TypeError':
                typeBits = ErrorTypeBits.TypeError;
                break;
            case 'URIError':
                typeBits = ErrorTypeBits.URIError;
                break;

            case 'Error':
            default:
                typeBits = ErrorTypeBits.Error;
        }

        this.putHeader(DataType.Error, typeBits);
        if (typeof data.message === 'undefined') {
            this.putUndefined();
        } else if (typeof data.message === 'string') {
            this.putString(data.message);
        } else {
            err(
                'Unexpected type of `message` field encountered while serializing Error object.',
            );
        }
        if (typeof data.stack === 'undefined') {
            this.putUndefined();
        } else if (typeof data.stack === 'string') {
            this.putString(data.stack);
        } else {
            err(
                'Unexpected type of `stack` field encountered while serializing Error object.',
            );
        }
    }

    private putDate(data: Date): void {
        if (this.putReferIfExists(data)) return;
        this.referencables.addAndGetIndex(data);

        this.putHeader(DataType.Date);
        this.putNumber(data.getTime(), true, NumberTypeBits.Double);
    }

    private putRegExp(data: RegExp): void {
        if (this.putReferIfExists(data)) return;
        this.referencables.addAndGetIndex(data);

        this.putHeader(DataType.RegExp);
        this.putString(data.source, true);
        this.putString(data.flags, true);
    }

    private putBooleanObject(data: Boolean): void {
        if (this.putReferIfExists(data)) return;
        this.referencables.addAndGetIndex(data);

        const typeBits = data.valueOf()
            ? BooleanTypeBits.True
            : BooleanTypeBits.False;
        this.putHeader(DataType.BooleanObject, typeBits);
    }
    private putNumberObject(
        _data: Number,
        omitType = false,
        typeBits?: NumberTypeBits,
    ): void {
        const data = _data.valueOf();
        if (typeBits === void 0) {
            typeBits = decideNumberTypeBits(data);
        }
        if (!omitType) {
            if (this.putReferIfExists(_data)) return;
            this.referencables.addAndGetIndex(_data);
            this.putHeader(DataType.NumberObject, typeBits);
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
    private putStringObject(
        _data: String,
        omitType = false,
        respectUserPrefer = false,
    ): void {
        const data = _data.valueOf();
        const preferUtf16 = respectUserPrefer ? this.preferUTF16 : false;
        if (!omitType) {
            if (this.putReferIfExists(_data)) return;
            this.referencables.addAndGetIndex(_data);

            const typeBits = preferUtf16
                ? StringTypeBits.UTF16
                : StringTypeBits.UTF8;
            this.putHeader(DataType.StringObject, typeBits);
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
    private putBigIntObject(_data: BigInt): void {
        if (this.putReferIfExists(_data)) return;
        this.referencables.addAndGetIndex(_data);

        let data = _data.valueOf();
        let typeBits: BigIntTypeBits;
        if (data < 0) {
            data = -data;
            typeBits = BigIntTypeBits.Negative;
        } else {
            typeBits = BigIntTypeBits.Positive;
        }
        this.putHeader(DataType.BigIntObject, typeBits);
        const buf = bigIntToBuffer(data);
        this.putArrayBuffer(buf.buffer, true);
    }
}
