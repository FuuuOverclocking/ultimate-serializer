export const version = 1;

export type Dictionary<T = string> = Record<string, T>;

export interface SerializerOptions {
    forUnsupported?: 'error' | 'warn' | 'avoid';
    enableBlobAndFile?: boolean;
    enableImageData?: boolean;
    enableNodeBuffer?: boolean;
    extraTypes?: TypeDescriptor[];
    onSerialize?: {
        stringEncodingFormat?: 'utf8' | 'utf16';
        refineArrayBufferView?: boolean | Array<ArrayBuffer | ArrayBufferView>;
    };
}

export interface TypeDescriptor {
    type: string;
    serialize?(data: any): false | any[] | Promise<any[]>;
    deserialize?(data: any[]): any;
}

export const predefinedTypeNames = [
    'Refer',
    'Set',
    'Map',
    'ArrayBuffer',
    'ArrayBufferView',
    'Boolean',
    'Number',
    'BigInt',
    'String',
    'Date',
    'RegExp',
    'Error',
];

export const enum DataType {
    Undefined = 0,
    Null = 1,
    Boolean = 2, // [bool: false | true]
    Number = 3,
    /*
        [type:
            | int8:0 = 1
            | uint8:1 = 1
            | int16:2 = 2
            | uint16:3 = 2
            | int32:4 = 4
            | uint32:5 = 4
            | double:6 = 8
        ],
        bits,
    */
    String = 4,
    /*
        [code: UTF-8 | UTF-16 = UTF-8],
        byteLength: Number,
        bits,
    */
    BigInt = 5, // [negative: 0 | 1] ArrayBuffer(ot)
    ArrayEmptySlots = 6, // (default disable) num: Number
    Refer = 7, // id: Number
    EOF = 8,
    ExtraTypeInfo = 23, // typenames: Array(ot)
    SerializationFormatVersion = 24, // version: Number(ot, uint8)
    // Referencable Type

    Array = 9, // length: Number(ot, uint32), ...slots: DataType(enable ArrayEmptySlot)[]
    Object = 10, // pairLength: Number(ot, uint32), ...slots: pair<String(ot), DataType>[]
    Set = 11, // size: Number(ot, uint32), ...slots: DataType[]
    Map = 12, // size: Number(ot, uint32), ...slots: pair<DataType, DataType>[]
    ArrayBuffer = 13, // size: Number(ot, double), bits
    ArrayBufferView = 14,
    /*
        Constructor(4 bit enum): DataView: 0,
        ByteLength: Number(ot, double),
        ByteOffset: Number(ot, double),
        buffer: ArrayBuffer or Refer,
    /*
        Constructor(4 bit enum):
            | Int8Array: 1
            | Uint8Array: 2
            | Uint8ClampedArray: 3
            | Int16Array
            | Uint16Array
            | Int32Array
            | Uint32Array
            | Float32Array
            | Float64Array
            | BigInt64Array
            | BigUint64Array: 11,
        ByteLength: Number(ot, double),
        ByteOffset: Number(ot, double),
        ArrayLength: Number(ot, double),
        buffer: ArrayBuffer or Refer,
    */
    BooleanObject = 15, // [bool: false | true]
    NumberObject = 16,
    /*
        [length:
            | int8:0 = 1
            | uint8:1 = 1
            | int16:2 = 2
            | uint16:3 = 2
            | int32:4 = 4
            | uint32:5 = 4
            | double:6 = 8
        ],
        bits,
    */
    StringObject = 17,
    /*
        [code: UTF-8 | UTF-16 = UTF-8],
        byteLength: Number,
        bits,
    */
    BigIntObject = 18, // ArrayBuffer(ot)
    Date = 19, // DateValue: Number(ot, double)
    RegExp = 20, // OriginalSource: String(ot), OriginalFlags: String(ot)
    Error = 21,
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
        message: String(ot),
        stack: String(ot),
    */
    ExtraType = 22, // typeId: Number(ot, uint8), comps: Array(ot)
    // Blob, // MIME: String, buffer: ArrayBuffer | Refer
    // File,
    // /*
    //     name: String,
    //     lastModified: Number(double),
    //     MIME: String,
    //     buffer: DataType[ ArrayBuffer | Refer ],
    // */
    // ImageData, // width: Number, data: DataType[ Uint8ClampedArray | Refer ]

    // FirstObjectTypeMark = Array,
}

export const enum BooleanTypeBits {
    False = 0 << 5,
    True = 1 << 5,
}
export const enum NumberTypeBits {
    Int8 = 0 << 5,
    Uint8 = 1 << 5,
    Int16 = 2 << 5,
    Uint16 = 3 << 5,
    Int32 = 4 << 5,
    Uint32 = 5 << 5,
    Double = 6 << 5,
}

export const enum StringTypeBits {
    Utf8 = 0 << 5,
    Utf16 = 1 << 5,
}

export const enum BigIntTypeBits {
    Positive = 0 << 5,
    Negative = 1 << 5,
}
