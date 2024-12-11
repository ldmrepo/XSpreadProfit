export function splitIntoBatches<T>(array: T[], batchSize: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
        result.push(array.slice(i, i + batchSize));
    }
    return result;
}
