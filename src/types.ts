export type Dictionary<T = string> = Record<string, T>;

export interface Options {
    forUnsupported?: 'error' | 'warn' | 'avoid';
    extraTypes?: TypeDescriptor[];
    serializing?: {
        preferUTF16?: boolean;
        refineArrayBufferView?: false;
    };
    enableBlobAndFile?: boolean;
    enableImageData?: boolean;
    enableNodeBuffer?: boolean;
}

export interface SerializerOptions {
    forUnsupported: 'error' | 'warn' | 'avoid';
    extraTypes: TypeDescriptor[];
    serializing: {
        preferUTF16: boolean;
        refineArrayBufferView: boolean | Array<ArrayBuffer | ArrayBufferView>;
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
    SerializationFormatVersion = 8, // version: Number(ot, uint8)
    ExtraTypeInfo = 9, // typenames: Array(ot)
    EOF = 10,

    // Referencable Type

    Array = 11, // length: Number, ...slots: DataType(enable ArrayEmptySlot)[]
    Object = 12, // pairLength: Number, ...slots: pair<String(ot), DataType>[]
    Set = 13, // size: Number, ...slots: DataType[]
    Map = 14, // size: Number, ...slots: pair<DataType, DataType>[]
    ArrayBuffer = 15, // size: Number(ot, double), bits
    ArrayBufferView = 16,
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
        ByteOffset: Number(ot, double),
        ArrayLength: Number(ot, double),
        buffer: ArrayBuffer or Refer,
    */
    BooleanObject = 17, // [bool: false | true]
    NumberObject = 18,
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
    StringObject = 19,
    /*
        [code: UTF-8 | UTF-16 = UTF-8],
        byteLength: Number,
        bits,
    */
    BigIntObject = 20, // [negative: 0 | 1] ArrayBuffer(ot)
    Date = 21, // DateValue: Number(ot, double)
    RegExp = 22, // OriginalSource: String(ot), OriginalFlags: String(ot)
    Error = 23,
    /*
        (if wrong, correct to Error silently at serializing, error at deserializing)
        [name:
            | Error
            | EvalError
            | RangeError
            | ReferenceError
            | SyntaxError
            | TypeError
            | URIError
        ],
        message: String | undefined,
        stack: String | undefined,
    */
    ExtraType = 24, // typeId: Number(ot, uint16), comps: Array(ot)
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
    UTF8 = 0 << 5,
    UTF16 = 1 << 5,
}

export const enum BigIntTypeBits {
    Positive = 0 << 5,
    Negative = 1 << 5,
}

export const enum ArrayBufferViewType {
    DataView = 0,
    Int8Array = 1,
    Uint8Array = 2,
    Uint8ClampedArray = 3,
    Int16Array = 4,
    Uint16Array = 5,
    Int32Array = 6,
    Uint32Array = 7,
    Float32Array = 8,
    Float64Array = 9,
    BigInt64Array = 10,
    BigUint64Array = 11,
}

export const enum ErrorTypeBits {
    Error = 0 << 5,
    EvalError = 1 << 5,
    RangeError = 2 << 5,
    ReferenceError = 3 << 5,
    SyntaxError = 4 << 5,
    TypeError = 5 << 5,
    URIError = 6 << 5,
}
