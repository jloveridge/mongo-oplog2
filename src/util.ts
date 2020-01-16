import { debuglog } from "util";
import { Timestamp } from "mongodb";

debuglog("mongo-oplog2:utils");

export const opMap = Object.freeze({
    i: "insert", insert: "i",
    d: "delete", delete: "d",
    n: "noop", noop: "n",
    u: "update", update: "i",
});


/**
 * Converts from the operation code from the native MongoDB versions to
 * friendlier names. Conversions are:
 *   i: insert
 *   d: delete
 *   n: noop
 *   u: update
 * @param op MongoDB operation code
 */
export function getOpName(op: string): string {
    return (<any>opMap)[op] || op;
}

/**
 * Converts a number into a MongoDB `Timestamp`
 * @param ts timestamp to convert
 */
export function getTimestamp(ts?: number | Timestamp | string): Timestamp {
    if (typeof ts === 'string') {
        return Timestamp.fromString(ts);
    } else if (typeof ts === 'number' || !ts) {
        return new Timestamp(0, ts ? ts : (Date.now() / 1000));
    }
    return ts;
}

/**
 * Returns a new object without any of the specified keys.
 * @param obj Initial object
 * @param keys array of keys to be removed from the object
 */
export function omit(obj: any, keys: string[]): any {
    const omitted = Object.assign({}, obj);
    for (const key of keys) {
        delete omitted[key];
    }
    return omitted;
}

/**
 * Converts from `OplogDoc` format to `PrettyOplogDoc` format.
 * @param oplogDoc a document in MongoDB OplogDoc format.
 */
export function prettify(oplogDoc: OplogDoc): PrettyOplogDoc {
    const aEvents: any = opMap;
    const doc: PrettyOplogDoc = <any>{
        namespace: oplogDoc.ns,
        operation: getOpName(oplogDoc.op),
        operationId: oplogDoc.h,
        timestamp: new Date((<any>oplogDoc.ts).high_ * 1000),
        ts: oplogDoc.ts,
    };
    const targetId = (oplogDoc.o2 && oplogDoc.o2._id?oplogDoc.o2._id:(oplogDoc.o && oplogDoc.o._id?oplogDoc.o._id:null));
    if (targetId) { doc.targetId = targetId; }
    if (oplogDoc.o2) { doc.criteria = oplogDoc.o2; }
    if (oplogDoc.o) { doc.data = oplogDoc.o; }
    return doc;
}

/**
 * Returns a `RegExp` used for filtering events.
 * @param pattern regex pattern
 */
export function regex(pattern: string): RegExp {
    pattern = pattern.replace(/[*]/g, "(.*?)");
    return new RegExp(`^${pattern}$`, "i");
}

/**
 * Returns a promise that will resolve after a specified period of time.
 * @param ms length of time before promise should resolve.
 */
export function timeout(ms: number) {
    return new Promise<any>((resolve) =>
        setTimeout(resolve, ms)
    );
}

/**
 * Defines the structure of a MongoDB oplog
 * document.
 */
export interface OplogDoc {
    ts: Timestamp;
    op: string;
    ns: string;
    h: any;
    o: any;
    o2: any;
}

/**
 * Defines the structure of a "pretty" oplog document
 * which is an alternate format for documents emitted
 * the `on.(op, fn)` events.
 */
export interface PrettyOplogDoc {
    criteria: any;
    data: any;
    namespace: string;
    operation: string;
    operationId: any;
    targetId: any;
    timestamp: Date;
    ts: Timestamp;
}
