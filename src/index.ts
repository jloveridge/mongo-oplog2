import { debuglog } from "util";
import { Cursor, Db, MongoClient, MongoClientOptions, Timestamp} from "mongodb";
import { EventEmitter, ListenerFn } from "eventemitter3";
import { FilteredMongoOplog } from "./filter";
import { getStream } from "./stream";
import { getOpName, getTimestamp, omit, OplogDoc, prettify } from './util';
import * as util from './util';
export { OplogDoc, PrettyOplogDoc, prettify } from "./util";

const debug = debuglog("mongo-oplog2");
const reErr = /cursor (killed or )?timed out/;

export interface MongoOplog extends EventEmitter {
    ignore: boolean;
    pretty: boolean;
    filter(): FilteredMongoOplog;
    filter(ns: string): FilteredMongoOplog;
    stop(): Promise<MongoOplog>;
    tail(): Promise<Cursor>;
    destroy(): Promise<MongoOplog>;
}

/**
 * Allows tailing the MongoDB oplog.
 */
export class MongoOplog extends EventEmitter implements MongoOplog {
    ignore: boolean = false;
    pretty: boolean = false;
    private _db?: Db;
    private dbOpts?: MongoClientOptions;
    private extDb: boolean = false;
    private uri: string = "";
    private ns: string;
    private collectionName: string;
    private _stream?: Cursor;
    private _ts: Timestamp;

    /**
     * @param uriOrDb a connection string or existing database connection
     * @param opts options for the `MongoOplog` instance. Any options not
     *             beyond thosed used by `MongoOplog` will be stored and
     *             passed along to the `mongodb` driver when creating a
     *             database connection.
     */
    constructor(uriOrDb?: string | Db, opts: Options = {}) {
        super();
        if (!uriOrDb || typeof uriOrDb === "string") {
            this.uri = uriOrDb || "mongodb://127.0.0.1/local";
            this.dbOpts = util.omit(opts, ["coll", "ns", "pretty", "since"]);
        } else {
            this._db = uriOrDb;
            this.extDb = true;
        }
        this.pretty = !!opts.pretty;
        this.ns = opts.ns || "";
        this.collectionName = opts.coll || "";
        this._ts = getTimestamp(opts.since || 0);
    }

    /**
     * Returns `true` if database is connected; false otherwise.
     */
    get connected(): boolean { return !!this._db; }

    /**
     * The database connection.
     */
    get db(): Db | undefined { return this._db; }

    /**
     * The underlying MongoDB cursor stream.
     */
    get stream(): Cursor | undefined { return this._stream; }

    /**
     * Last processed timestamp.
     */
    get ts(): Timestamp { return this._ts; }

    /**
     * Returns an event emitter that will emit database events for the specified
     * name space.
     * @param ns namespace for the filter.
     */
    filter(ns: string = ""): FilteredMongoOplog { return new FilteredMongoOplog(this, ns); }

    /**
     * Stop tailing the oplog, disconnect from the database, and emit the
     * "destroy" event.
     */
    async destroy(): Promise<MongoOplog> {
        await this.stop();
        await this.disconnect();
        this.removeAllListeners();
        this.emit("destroy");
        return this;
    }

    /**
     * Stop tailing the oplog and destroy the underlying cursor. Tailing
     * can be resumed by calling the `tail` function.
     */
    async stop(): Promise<MongoOplog> {
        if (this._stream) { this._stream.destroy(); }
        debug("streaming stopped");
        return this;
    }

    /**
     * Start tailing the oplog.
     */
    async tail(): Promise<Cursor> {
        const onError = (err: Error): any => {
            if (reErr.test(err.message)) {
                debug("cursor timedout - retailing: %j", err);
                return this.tail();
            } else {
                debug("oplog error: %j", err);
                this.emit("error", err);
            }
        };
        try {
            if (!this._db) { await this.connect(); }
            this._stream = await getStream(this._db, this.ns, this.ts, this.collectionName);
            debug("stream started");
            this.emit("tail-start");
            this._stream.on("end", () => {
                debug("stream ended");
                this.emit("end");
                this.emit("tail-end");
            });
            this._stream.on("error", onError);
            this._stream.on("data", (doc: OplogDoc) => {
                if (this.ignore) { return; }
                this._ts = doc.ts;
                const opName = util.getOpName(doc.op);
                const outDoc = this.pretty ? util.prettify(doc) : doc;
                debug("incoming data: %j", doc);
                debug("outgoing data: %j", outDoc);
                this.emit("op", outDoc);
                this.emit(opName, outDoc);
            });
            return this._stream;
        } catch (err) {
            return onError(err);
        }
    }

    /**
     * Connect to the database.
     */
    private async connect(): Promise<Db> {
        if (this._db) { return this._db; }
        const db = await util.getDbConnection(this.uri, this.dbOpts);
        debug("Connected to oplog database.");
        this.emit("connect");
        this._db = db;
        return db;
    }

    /**
     * Disconnect from the database by calling `close`.
     * If database connection is externally supplied do NOT call `close`.
     */
    private async disconnect(): Promise<void> {
        if (this.extDb || !this._db) {
            debug("refusing to disconnect external or unconnected db.");
            return;
        }
        await this._db.close(true);
        this._db = void 0;
        this.emit("disconnect");
    }
}

export interface Options {
    coll?: string;
    ns?: string;
    pretty?: boolean;
    since?: number;
}

/**
 * Creates an instance of MongoOplog. This method exists for backwards compatibility
 * with the `mongo-oplog` package. Normal expected behavior would be to call new
 * directly.
 */
export function createInstance(): MongoOplog;
export function createInstance(uri: string): MongoOplog;
export function createInstance(uri: string, opts: Options): MongoOplog;
export function createInstance(db: Db): MongoOplog;
export function createInstance(db: Db, opts: Options): MongoOplog;
export function createInstance(uriOrDb?: string | Db, opts: Options = {}): MongoOplog {
    return new MongoOplog(uriOrDb, opts);
}

export const OplogEvents = Object.freeze(["delete", "insert", "op", "update"]);
export type OplogEvents = "delete" | "insert" | "op" | "update";
export const MongoOplogStatus = Object.freeze(["connect", "destroy", "end", "error"]);
export type MongoOplogStatus = "connect" | "destroy" | "end" | "error";
export const Events = Object.freeze([
    "connect", "destroy", "end", "error",
    "delete", "insert", "op", "update",
]);

export type Events = MongoOplogStatus | OplogEvents;

export default createInstance;
