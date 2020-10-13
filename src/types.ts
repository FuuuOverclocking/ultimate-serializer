export interface SerializeOptions {
    target: 'string' | 'Uint8Array' | 'Uint8Array[]';
    forUnsupported?: 'error' | 'avoid';
    allowBlobAndFile?: boolean;
    allowImageData?: boolean;
    returns?: 'direct' | 'promise' | 'node-readable-stream';
}

export type SerializeReturn =
    | string
    | Uint8Array[]
    | Uint8Array
    | Promise<string>
    | Promise<Uint8Array[]>
    | Promise<Uint8Array>
    | NodeJS.ReadableStream;

export interface DeserializeOptions {}

export const enum DataType {
    Undefined,
    Null,
    True,
    False,
    Number, // type: double | uint32 | int16 | uint8 = double, bits
    String, // isUTF16 = false, length: Number, bits
    BigInt, // ArrayBuffer
    ArrayEmptySlots, // (default disable) num: Number(uint32)
    Reference, // ObjectId: Number(uint32)

    // Referencable Type

    Array, // length: Number(uint32), ...slots: DataType(enable ArrayEmptySlot)[]
    Object, // length: Number(uint32), ...slots: pair<String, DataType>[]
    Set, // length: Number(uint32), ...slots: DataType[]
    Map, // length: Number(uint32), ...slots: pair<DataType, DataType>[]
    ArrayBuffer, // size: Number, bits
    ArrayBufferView,
    /*
        Constructor: DataView,
        ByteLength: Number,
        ByteOffset: Number,
        buffer: ArrayBuffer or Reference(need check),
    /*
        Constructor:
            | Int8Array
            | Uint8Array
            | Uint8ClampedArray
            | Int16Array
            | Uint16Array
            | Int32Array
            | Uint32Array
            | Float32Array
            | Float64Array
            | BigInt64Array
            | BigUint64Array,
        ByteLength: Number,
        ByteOffset: Number,
        ArrayLength: Number,
        buffer: ArrayBuffer or Reference(need check),
    */
    TrueBooleanObject,
    FalseBooleanObject,
    NumberObject, // type: double | uint32 | int16 | uint8 = double, bits
    BigIntObject, // ArrayBuffer
    StringObject, // isUTF16 = false, length: Number, bits
    Date, // DateValue: Number
    RegExp, // OriginalSource: String, OriginalFlags: String
    Error,
    /*
        (if wrong, correct to Error silently at serializing, error at deserializing)
        name:
            | Error
            | EvalError
            | RangeError
            | ReferenceError
            | SyntaxError
            | TypeError
            | URIError,
        message: String,
        stack: String,
    */
    Blob, // MIME: String, buffer: ArrayBuffer or Reference(need check)
    File,
    /*
        name: String,
        lastModified: Number,
        MIME: String,
        buffer: ArrayBuffer or Reference(need check),
    */
    ImageData, // width: Number, data: Uint8ClampedArray or Reference(need check)

    FirstObjectTypeMark = Array,
}
