# Serialize Structured Data

Serialize and Deserialize structured data, following HTML 5 standard, in a compact and fast way, allowing binary data and serialization to binary.

[![GitHub license](https://img.shields.io/github/license/xyzingh/serialize-structured-data)](https://github.com/xyzingh/serialize-structured-data/blob/main/LICENSE)
![state](https://img.shields.io/badge/state-under--working-red)
![npm](https://img.shields.io/npm/v/serialize-structured-data)

```
Primitive types
Boolean objects
String objects
Date
RegExp
Blob
File
FileList          serialize
ArrayBuffer      ----------→ string or binary(Buffer)
ArrayBufferView                     |
ImageBitmap                         | deserialize
ImageData                           ↓
Array                          original data
Object
Map
Set
```

HTML 5 Living Standard:

https://html.spec.whatwg.org/multipage/structured-data.html

MDN: The structured clone algorithm

https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
