import { Cursor, Db, Timestamp } from "mongodb";
import { getTimestamp, regex } from "./util";

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
    return await collection.find(query, {
        awaitData: true,
        noCursorTimeout: true,
        numberOfRetries: Number.MAX_VALUE,
        oplogReplay: true,
        tailable: true,
    }).stream();
}
