import { Cursor, Db, Timestamp } from "mongodb";
import { getTimestamp, regex, OplogDoc } from "./util";

/**
 * Obtain a cursor stream for the oplog.
 * @param db database connection
 * @param ns optional namespace for filtering of documents returned
 * @param ts timestamp to start from. No specified timestamp is treated as from now.
 * @param coll collection for the oplog. (default: "oplog.rs")
 */
export async function getStream(db?: Db, ns?: string, ts?: number | Timestamp, coll?: string): Promise<Cursor> {
    if (!db) { throw new Error("Mongo db is missing."); }
    coll = coll || "oplog.rs";
    const collection = db.collection(coll);
    const timestamp = getTimestamp(ts);
    const query: any = {ts: {$gt: timestamp}};
    if (ns) { query.ns = {$regex: regex(ns)}; }
    const cursor = collection.find(query);
    for (const flag of ['awaitData', 'noCursorTimeout', 'oplogReplay', 'tailable']) {
        cursor.addCursorFlag(flag, true);
    }
    cursor.setCursorOption('numberOfRetries', Number.MAX_VALUE as any);
    return cursor.stream();
}

/**
 * Retrieves the last document from the capped collection.
 * @param db database connection
 * @param ns optional namespace for filtering of ducoments returned
 * @param coll collection to query (default: "oplog.rs")
 */
export async function getLastDoc(db?: Db, ns?: string, coll?: string) {
    if (!db) { throw new Error("MongoDB connection is missing."); }
    coll = coll || "oplog.rs";
    const collection = db.collection(coll);
    const query: any = ns ? {ns: {$regex: regex(ns)}} : {};
    const cursor = collection.find(query).sort({$natural: -1}).limit(1);
    const doc: OplogDoc = await cursor.next();
    return doc;
}
