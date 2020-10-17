export function isStringSerializationTarget(target: string): boolean {
    return (
        ['string', 'Promise<string>', 'ReadableStream<string>'].indexOf(
            target,
        ) !== -1
    );
}
