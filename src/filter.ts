import { debuglog } from "util";
import EventEmitter from "./eventemitter";
import { MongoOplog, OplogEvents, OplogType } from "./";
import { getOpName, OplogDoc, prettify, PrettyOplogDoc, regex } from './util';

const debug = debuglog("mongo-oplog2:filter");

type FilteredOplogEvents<isPretty extends boolean> = OplogEvents<isPretty> & {destroy: [void]};

export interface FilteredMongoOplog<isPretty extends boolean> extends EventEmitter<FilteredOplogEvents<isPretty>> {
    ignore: boolean;
    oplog: MongoOplog<isPretty>;
    destroy(): void;
}

/**
 * Allows filtering of the oplog events. A typical usecase would be to have the
 * main `oplog` instance tailing an entire database but then create a filter for
 * a specifc collection to create triggers independently.
 */
export class FilteredMongoOplog<isPretty extends boolean>
                    extends EventEmitter<FilteredOplogEvents<isPretty>>
                    implements FilteredMongoOplog<isPretty> {
    ignore: boolean = false;
    oplog: MongoOplog<isPretty>;
    private onOp: EventEmitter.ListenerFn<[OplogType<isPretty>]>;

    constructor(oplog: MongoOplog<isPretty>, ns: string = "*") {
        super();
        debug("initializing filter with re %s", ns);
        const re = regex(ns);
        this.oplog = oplog;
        this.onOp = (doc: any) => {
            const docNs = doc.namespace || doc.ns;
            if (this.ignore || !re.test(docNs)) { return; }
            debug("incoming data %j", doc);
            const opName: ReturnType<typeof getOpName> = doc.operation || getOpName(doc.op);
            this.emit("op", doc);
            this.emit(opName, doc);
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
