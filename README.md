# Serialize Structured Data

Serialize and Deserialize structured data, following HTML 5 standard, in a compact and fast way, allowing binary data and serialization to binary.

[![GitHub license](https://img.shields.io/github/license/xyzingh/serialize-structured-data)](https://github.com/xyzingh/serialize-structured-data/blob/main/LICENSE)
![state](https://img.shields.io/badge/state-under--working-red)
![npm](https://img.shields.io/npm/v/serialize-structured-data)

```
Primitive types (except symbol)
Boolean objects
Number objects
BigInt objects
String objects
Date
RegExp
▲ Blob
▲ File
× FileList            serialize
ArrayBuffer        <-------------> string or binary(Buffer)
ArrayBufferView      deserialize
× ImageBitmap
▲ ImageData
Array
Object
Map
Set
```

- Cannot serialize/deserialize symbol, function, WeakMap, WeakSet, WeakRef, Promise, FileList, ImageBitmap, DOM Node.
- Allow Proxy object, since we cannot distinguish them.
- Remind: If you serialize an ArrayBufferView, the original ArrayBuffer it references will be serialized, even if the ArrayBufferView only refers to part of its memory location.

HTML 5 Living Standard:

https://html.spec.whatwg.org/multipage/structured-data.html

MDN: The structured clone algorithm

https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
