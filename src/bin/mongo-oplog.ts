import * as fs from "fs";
import * as util from "util";

import * as prog from "commander";
import { MongoClientOptions } from "mongodb";

import { MongoOplog, Options } from "../";

/**
 * Read a file into a Buffer.
 * @param filename file to read
 */
function readFile(filename: string): Buffer | string {
    return fs.readFileSync(filename);
}

export async function main(args: string[]) {
    const argv = prog
        .version(require("../../package.json").version) // tslint:disable-line
        .usage("[options] [db host]")
        .option("--namespace <namespace>", "namespace filter")
        .option("--pretty", "pretty oplog doc format")
        .option("--replSet <replSetName>", "replica set name")
        .option("--since <since>", "oplog documents since x")
        .option("--ssl", "connect using SSL/TLS")
        .option("--sslCAFile <filename>", "Certificate Authority filename")
        .option("--sslCertFile <filename>", "Certificate filename")
        .option("--sslPEMKeyFile <filename>", "PEM Key filename")
        .option("--sslPEMKeyPassword <password>", "Password for key in PEM file")
        .parse(args)
    ;
    const mongoOpts = extractMongoClientOptions(argv);
    const oplogOpts = extractOplogOpts(argv);
    const hosts = argv.args.join() || 'localhost';
    watchOplog(hosts, oplogOpts, mongoOpts);
}

if (!module.parent) {
    main(process.argv);
}

function extractMongoClientOptions(opts: any): MongoClientOptions {
    const options: MongoClientOptions = {};
    if (opts.replSet) { options.replicaSet = opts.replSet; }
    if (opts.ssl) { options.ssl = true; }
    if (opts.sslCAFile) { options.sslCA = [readFile(opts.sslCAFile)]; }
    if (opts.sslCertFile) { options.sslCert = readFile(opts.sslCertFile); }
    if (opts.sslPEMKeyFile) {
        options.sslKey = readFile(opts.sslPEMKeyFile);
        if (opts.sslPEMKeyPassword) { options.sslPass = opts.sslPEMKeyPassword; }
    }
    // Make sure `ssl` flag is set if any SSL options are specified
    if (Object.keys(options).some(k => k.startsWith("ssl"))) { options.ssl = true; }
    return options;
}

function extractOplogOpts(opts: any): Options {
    const options: Options = {};
    if (opts.namespace) { options.ns = opts.namespace; }
    if (opts.since) {
        const since: string = opts.since;
        if (since.includes("-")) {
            options.since = (new Date(since)).getTime() / 1000;
        } else {
            options.since = parseFloat(since);
        }
    }
    if (opts.pretty) { options.pretty = true; }
    return options;
}

function watchOplog(hosts: string, oplogOpts: Options, dbOpts: MongoClientOptions) {
    const opts = Object.assign({}, oplogOpts, dbOpts);
    const oplog = new MongoOplog(`mongodb://${hosts}/local`, opts);
    oplog.on("op", (doc: any) => {
        doc = JSON.parse(JSON.stringify(doc));
        console.log(
            util.inspect(
                doc,
                {breakLength: Infinity, depth: null, colors: true}
            )
        );
    });
    oplog.tail();
}
