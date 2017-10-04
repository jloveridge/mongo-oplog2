import { debuglog } from "util";
import { EventEmitter, ListenerFn } from "eventemitter3";
import { MongoOplog, OplogEvents } from "./";
import { getOpName, OplogDoc, prettify, regex } from './util';

const debug = debuglog("mongo-oplog2:filter");

export interface FilteredMongoOplog {
    ignore: boolean;
    oplog: MongoOplog;
    destroy(): void;
}

/**
 * Allows filtering of the oplog events. A typical usecase would be to have the
 * main `oplog` instance tailing an entire database but then create a filter for
 * a specifc collection to create triggers independently.
 */
export class FilteredMongoOplog extends EventEmitter implements FilteredMongoOplog {
    ignore: boolean = false;
    oplog: MongoOplog;
    private onOp: ListenerFn;

    constructor(oplog: MongoOplog, ns: string = "*") {
        super();
        debug("initializing filter with re %s", ns);
        const re = regex(ns);
        this.oplog = oplog;
        this.onOp = (doc: OplogDoc) => {
            if (this.ignore || !re.test(doc.ns)) { return; }
            debug("incoming data %j", doc);
            const opName = getOpName(doc.op);
            const outDoc = oplog.pretty ? prettify(doc) : doc;
            this.emit("op", outDoc);
            this.emit(opName, outDoc);
        };
        oplog.on("op", this.onOp);
    }

    /**
     * Removes the filter from the listeners for the oplog instance and
     * removes all event listeners from the filter.
     */
    destroy() {
        debug("removing filter bindings");
        this.emit("destroy");
        this.oplog.removeListener("op", this.onOp);
        this.removeAllListeners();
    }
}
