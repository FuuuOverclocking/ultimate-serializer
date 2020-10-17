import {
    SerializerOptions,
    TypeDescriptor,
    Dictionary,
    predefinedTypeNames,
} from './types';
import {
    BinarySerialization,
    isBinarySerializationTarget,
} from './binary-serialization';
import { isStringSerializationTarget } from './string-serialization';

class UltimateSerializer {
    public forUnsupported: 'error' | 'warn' | 'avoid';
    constructor(options?: SerializerOptions) {
        options ??= {};
        this.forUnsupported = options.forUnsupported ?? 'error';
        if (options.enableBlobAndFile) {
            // this.define();
        }
        if (options.enableImageData) {
            // this.define();
        }
        if (options.enableNodeBuffer) {
            // this.define();
        }
        if (options.extraTypes) {
            for (const typeDesc of options.extraTypes) {
                this.define(typeDesc);
            }
        }
    }

    private extraTypes: Dictionary<TypeDescriptor> = {};
    private extraTypesNum = 0;

    public define(descriptor: TypeDescriptor): this {
        const { type } = descriptor;
        if (this.extraTypes[type] || predefinedTypeNames.indexOf(type) !== -1) {
            throw new Error(`Type "${type}" has already been defined.`);
        }
        if (type.length > 32 || !/^[A-Z][0-9a-zA-Z_$]*$/.test(type)) {
            throw new Error(
                `UltimateSerializer: Type "${type}" must start with a capital ` +
                    `letter, composed of letters, numbers, _ and $, whose ` +
                    `length should be <= 32.`,
            );
        }
        if (this.extraTypesNum >= 256) {
            throw new Error(
                `UltimateSerializer: 256 extra types have been defined. No more ` +
                    `extra types can be defined.`,
            );
        }
        this.extraTypes[type] = descriptor;
        this.extraTypesNum++;
        return this;
    }

    public serialize(data: any, target: 'string'): string;
    public serialize(data: any, target: 'Uint8Array'): Uint8Array;
    public serialize(data: any, target: 'Uint8Array[]'): Uint8Array[];
    public serialize(data: any, target: 'Promise<string>'): Promise<string>;
    public serialize(
        data: any,
        target: 'Promise<Uint8Array>',
    ): Promise<Uint8Array>;
    public serialize(
        data: any,
        target: 'Promise<Uint8Array[]>',
    ): Promise<Uint8Array[]>;
    public serialize(
        data: any,
        target: 'ReadableStream<string>',
    ): ReadableStream<string>;
    public serialize(
        data: any,
        target: 'ReadableStream<Uint8Array>',
    ): ReadableStream<Uint8Array>;

    public serialize(data: any, target: string): any {
        if (isBinarySerializationTarget(target)) {
            return new BinarySerialization(this, data).evaluate(target);
        }
        if (isStringSerializationTarget(target)) {
            return new StringSerialization(this, data).evaluate(target);
        }
        throw new Error('UltimateSerializer: Invalid serialization target.');
    }
}

export = UltimateSerializer;
