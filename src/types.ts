export type Dictionary<T = string> = Record<string, T>;

export interface SerializerOptions {
    forUnsupported?: 'error' | 'warn' | 'avoid';
    enableBlobAndFile?: boolean;
    enableImageData?: boolean;
    enableNodeBuffer?: boolean;
    extraTypes?: TypeDescriptor[];
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
