import type { SerializeOptions, SerializeReturn } from './types';
import { Serialization } from './serialization';
import { checkSerializeEnvironment } from './env';

export function serialize(
    data: any,
    target: SerializeOptions['target'],
): SerializeReturn;
export function serialize(
    data: any,
    options: SerializeOptions,
): SerializeReturn;
export function serialize(
    data: any,
    opts: SerializeOptions | SerializeOptions['target'],
): SerializeReturn {
    const options: SerializeOptions =
        typeof opts === 'string'
            ? {
                  target: opts,
              }
            : opts;
    options.forUnsupported ??= 'error';
    options.allowBlobAndFile ??= false;
    options.allowImageData ??= false;
    options.returns ??= options.allowBlobAndFile ? 'promise' : 'direct';

    checkSerializeOptions(options);
    checkSerializeEnvironment(options);

    return new Serialization(data, options).getResult();
}

function checkSerializeOptions(options: SerializeOptions) {
    const errorMessage = 'serialize-structured-data: Invalid arguments.';
    const {
        target,
        forUnsupported,
        allowBlobAndFile,
        allowImageData,
        returns,
    } = options;

    if (
        target !== 'string' &&
        target !== 'Uint8Array' &&
        target !== 'Uint8Array[]'
    ) {
        throw new Error(errorMessage);
    }
    if (
        forUnsupported !== void 0 &&
        forUnsupported !== 'error' &&
        forUnsupported !== 'avoid'
    ) {
        throw new Error(errorMessage);
    }
    if (typeof allowBlobAndFile !== 'boolean') {
        throw new Error(errorMessage);
    }
    if (typeof allowImageData !== 'boolean') {
        throw new Error(errorMessage);
    }
    if (
        returns !== 'direct' &&
        returns !== 'node-readable-stream' &&
        returns !== 'promise'
    ) {
        throw new Error(errorMessage);
    }
    if (allowBlobAndFile && returns === 'direct') {
        throw new Error(errorMessage);
    }
}
