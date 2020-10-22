import UltimateSerializer from '.';

const stringSerializationTargets = [
    'string',
    'Promise<string>',
    'ReadableStream<string>',
] as const;

export function isStringSerializationTarget(
    target: string,
): target is StringSerializationTarget {
    return stringSerializationTargets.indexOf(target as any) !== -1;
}

type StringSerializationTarget = typeof stringSerializationTargets[number];

export class StringSerialization {
    constructor(
        private readonly inst: UltimateSerializer,
        private readonly data: any,
    ) {}

    evaluate(target: StringSerializationTarget) {}
}
