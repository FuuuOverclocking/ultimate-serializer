import { SerializeOptions } from './types';

export const inBrowser = typeof window !== 'undefined';

export function isDOMNode(o: any) {
    return (
        inBrowser &&
        (typeof window.Node === 'object'
            ? o instanceof window.Node
            : o &&
              typeof o === 'object' &&
              typeof o.nodeType === 'number' &&
              typeof o.nodeName === 'string')
    );
}

// export const hasDOMException =
//     typeof DOMException && typeof DOMException === 'function';

export const TypedArray = (function () {
    if (typeof Int8Array === 'undefined') return;

    const TypedArrayProto = Object.getPrototypeOf(Int8Array.prototype);
    if (typeof TypedArrayProto === 'object' && TypedArrayProto !== null) {
        return TypedArrayProto.constructor;
    }
})();

export function checkSerializeEnvironment(options: SerializeOptions): void {
    const lacks = [];

    if (options.target === 'Uint8Array' || options.target === 'Uint8Array[]') {
        if (typeof ArrayBuffer !== 'function') {
            lacks.push('ArrayBuffer');
        }
        if (typeof Uint8Array !== 'function') {
            lacks.push('Uint8Array');
        }
    }

    if (options.returns === 'promise') {
        if (
            typeof Promise === 'undefined' ||
            Promise.toString().indexOf('[native code]') === -1
        ) {
            lacks.push('Promise');
        }
    } else if (options.returns === 'node-readable-stream') {
        if (typeof require !== 'function') {
            lacks.push('ReadableStream');
        } else {
            try {
                if (typeof require('stream').Readable !== 'function') {
                    lacks.push('ReadableStream');
                }
            } catch (e) {
                lacks.push('ReadableStream');
            }
        }
    }

    if (lacks.length) {
        throw new Error(
            'serialize-structured-data: Environment lacks support for ' +
                lacks.join(', ') +
                '.',
        );
    }
}
