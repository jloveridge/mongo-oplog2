/**
 * Module dependencies.
 */
import { getTimestamp, timeout } from '../src/util';
import { expect } from 'chai';
import 'mocha';
import { Cursor, Db, MongoClient, Timestamp } from 'mongodb';
import { createInstance, MongoOplog, OplogDoc } from '../src';
import { fail } from 'assert';

const conn = {
    mongo: 'mongodb://127.0.0.1:27017/optest',
    oplog: 'mongodb://127.0.0.1:27017/local',
    error: 'mongodb://127.0.0.1:8888/error'
};
let oplog: MongoOplog = null as any;

describe('mongo-oplog', () => {
    let client: MongoClient;
    let db: Db;
    before(async () => {
        client = await MongoClient.connect(conn.mongo, {useUnifiedTopology: true});
        db = client.db();
    });
    afterEach(async () => {
        if (oplog) {
            oplog.destroy();
            oplog = null as any;
        }
    });

    it('should be a function', () => {
        expect(createInstance).to.be.an('function');
        expect(MongoOplog).to.be.an('function');
    });

    it('should have required methods', () => {
        oplog = new MongoOplog();
        expect(typeof oplog.tail).to.eq('function');
        expect(typeof oplog.stop).to.eq('function');
        expect(typeof oplog.filter).to.eq('function');
        expect(typeof oplog.destroy).to.eq('function');
    });

    it('should accept mongodb object as connection', async () => {
        const mongoClient = await MongoClient.connect(conn.oplog, {useUnifiedTopology: true});
        const database = mongoClient.db();
        oplog = new MongoOplog(database);
        expect(oplog.db).to.eq(database);
        await mongoClient.close();
    });

    it('should emit `op` event', async () => {
        let coll = db.collection('a');
        oplog = new MongoOplog(conn.oplog, { ns: 'optest.a' });
        await oplog.tail().then(() => coll.insertOne({n: "JB", c: 1}));
        return new Promise<any>((resolve) => {
            oplog.on("op", (doc: OplogDoc) => {
                expect(doc.op).to.eq("i");
                expect(doc.o.n).to.eq("JB");
                expect(doc.o.c).to.eq(1);
                resolve();
            });
        });
    });

    it('should emit `insert` event', (done) => {
        let coll = db.collection('b');
        oplog = new MongoOplog(conn.oplog, { ns: 'optest.b' });
        oplog.on("insert", (doc: OplogDoc) => {
            expect(doc.op).to.eq('i');
            expect(doc.o.n).to.eq('JBL');
            expect(doc.o.c).to.eq(1);
            done();
        });
        oplog.tail()
            .then(() => coll.insertOne({n: "JBL", c: 1}))
            .catch(done);
    });

    it('should emit `update` event', (done) => {
        let coll = db.collection('c');
        oplog = new MongoOplog(conn.oplog, { ns: 'optest.c' });
        oplog.on("update", (doc: OplogDoc) => {
            expect(doc.op).to.eq('u');
            expect(doc.o.$set.n).to.eq('US');
            expect(doc.o.$set.c).to.eq(7);
            done();
        });
        oplog.tail()
            .then(() => coll.insertOne({n: "CR", c: 3}))
            .then(() => coll.updateOne(
                {_id: {$exists: true}, n: "CR", c: 3}, {$set: {n: "US", c: 7}}
            )).catch(done);
    });

    it('should emit `delete` event', (done) => {
        let coll = db.collection('d');
        oplog = new MongoOplog(conn.oplog, { ns: 'optest.d' });
        let id: any;
        oplog.tail()
            .then(x => coll.insertOne({ n: 'PM', c: 4 }))
            .then(doc => {
                id = (doc.ops || doc)[0]._id;
                return coll.deleteOne({_id: {$exists: true}, n: 'PM', c: 4 });
            })
            .catch(done);
        oplog.on("delete", (doc: OplogDoc) => {
            expect(doc.op).to.eq('d');
            expect(doc.o._id.toString()).to.eq(id.toString());
            done();
        });
    });

    it('should emit cursor `end` event', (done) => {
        oplog = new MongoOplog(conn.oplog);
        oplog.once("end", done);
        oplog.tail()
          .then((stream) => stream && stream.emit("end"))
          .catch(done);
    });

    it('should emit `error` event', (done) => {
        oplog = new MongoOplog(conn.error);
        oplog.on('error', (err: Error) => {
            expect(err).instanceof(Error);
            done();
        });
        oplog.tail().catch(done);
    }).timeout(40000);


    it('should filter by namespace in constructor', (done) => {
        let f1 = db.collection('f1');
        let f2 = db.collection('f2');
        oplog = new MongoOplog(conn.oplog, { ns: '*.f1' });
        oplog.on('op', (doc: OplogDoc) => {
            expect(doc.o.n).to.eq('L2');
            done();
        });
        oplog.tail()
          .then(() => f1.insertOne({ n: 'L2' }))
          .then(() => f2.insertOne({ n: 'L2' }))
          .catch(done);
    });


    it('should stop tailing', async () => {
        let coll = db.collection('stoptail');
        oplog = new MongoOplog(conn.oplog, { ns: '*.stoptail' });
        let count = 0;
        let resolved = false;
        let stopped = new Promise<any>((resolve) => {
            oplog.on('op', async (doc: OplogDoc) => {
                count++;
                await oplog.stop();
                if (!resolved) { resolve(); }
            });
        });

        return oplog.tail()
            .then(() => coll.insertOne({ n: 'CR' }))
            .then(() => stopped)
            .then(() => coll.insertOne({ n: 'CR' }))
            .then(async() => {
                await timeout(10);
                expect(count).to.eq(1);
            });
    });

    it('should destroy oplog', (done) => {
        let coll = db.collection('i');
        oplog = new MongoOplog(conn.oplog);
        oplog.on('op', (doc: OplogDoc) => {
            oplog.destroy().then(() => done());
        });
        oplog.tail()
            .then(() => coll.insertOne({ n: 'CR' }))
            .then(() => coll.insertOne({ n: 'CR' }))
            .catch(done);
    });

    it('should ignore oplog op events', (done) => {
        let coll = db.collection('j');
        oplog = new MongoOplog(conn.oplog, { ns: '*.j' });
        oplog.on('op', (doc: OplogDoc) => {
            oplog.ignore = true;
            done(); // test would fail if done is called twice
        });
        oplog.tail()
            .then(() => coll.insertOne({ n: 'CR' }))
            .then(() => {
                coll.insertOne({ n: 'CR' });
            })
            .catch(done);
    });

    it('should stop tailing', (done) => {
        let coll = db.collection('h');
        oplog = new MongoOplog(conn.oplog, { ns: '*.h' });
        oplog.on('op', (doc: OplogDoc) => {
            oplog.stop();
            done();
        });
        oplog.tail()
            .then(() => coll.insertOne({ n: 'CR' }))
            .then(() => coll.insertOne({ n: 'CR' }))
            .catch(done);
    });

    it('should start from last ts when re-tailing', async () => {
        let c = 0;
        let coll = db.collection('restartfromts');
        oplog = new MongoOplog(conn.oplog, { ns: 'optest.restartfromts' });
        let res3: Function, promise3 = new Promise<any>((resolve) => res3 = resolve);
        let res6: Function, promise6 = new Promise<any>((resolve) => res6 = resolve);
        oplog.on('op', (doc: OplogDoc) => {
            const val = doc.o.c;
            if (val === 3) { res3(); }
            else if (val === 6) { res6(); }
            expect(val).to.eq(++c);
        });

        return oplog.tail().then(async () => {
                await coll.insertOne({ c: 1 });
                await coll.insertOne({ c: 2 });
                await coll.insertOne({ c: 3 });
                return promise3;
            })
            .then(() => oplog.stop())
            .then(async () => {
                await coll.insertOne({ c: 4 });
                await coll.insertOne({ c: 5 });
                await coll.insertOne({ c: 6 });
            })
           .then(() => {
               oplog.tail();
               return promise6;
           });
    });

    it('should start re-tailing on timeout', async () => {
        let c = 0;
        let v: any = {};
        let coll = db.collection('retailonstop');
        oplog = new MongoOplog(conn.oplog, { ns: 'optest.retailonstop' });
        let values: any = {};
        let valueSize = 0;
        let res3: Function, promise3 = new Promise<any>((resolve) => res3 = resolve);
        let res6: Function, promise6 = new Promise<any>((resolve) => res6 = resolve);
        let stream: Cursor | undefined;
        oplog.on('op', (doc: OplogDoc) => {
            const value = doc.o.c;
            expect(value).to.eq(++c);
            if (c === 3) { res3(); }
            else if (c === 6) { res6(); }
        });
        return oplog.tail()
            .then(async (_stream) => {
                stream = _stream;
                if (stream) {
                    stream.on('error', async () => {
                        await coll.insertOne({c: 4});
                        await coll.insertOne({c: 5});
                        await coll.insertOne({c: 6});
                    });
                }
            })
            .then(async () => {
                await coll.insertOne({ c: 1 });
                await coll.insertOne({ c: 2 });
                await coll.insertOne({ c: 3 });
                return promise3;
            })
            // Mimic a timeout error
            .then(() => {
                if (!stream) {
                    return;
                }
                stream.emit('error', new Error('cursor killed or timed out'));
                stream.close();
                return promise6;
            })
            .catch((err) => {
                fail(err);
            });
    });

    it('should not throw if `destroy` called before connecting', async () => {
        oplog = new MongoOplog();
        await oplog.destroy();
    });

    describe('filter tests', () => {
      it('should destroy filter', (done) => {
          let coll = db.collection('g');
          oplog = new MongoOplog(conn.oplog);
          let filter = oplog.filter('*.g');
          filter.on('op', (doc: OplogDoc) => {
              filter.destroy();
              done();
          });
          oplog.tail()
              .then(() => coll.insertOne({ n: 'CR' }))
              .then(() => coll.insertOne({ n: 'CR' }))
              .catch(done);
      });

      it('should ignore filter op events', (done) => {
          let coll = db.collection('k');
          oplog = new MongoOplog(conn.oplog);
          let filter = oplog.filter('*.k');

          filter.on('op', (doc: OplogDoc) => {
              filter.ignore = true;
              done();
          });

          oplog.tail()
              .then(() => coll.insertOne({ n: 'CR' }))
              .then(() => coll.insertOne({ n: 'CR' }))
              .catch(done);
      });

      it('should filter by collection', (done) => {
          let e1 = db.collection('e1');
          let e2 = db.collection('e2');
          oplog = new MongoOplog(conn.oplog);

          let filter = oplog.filter('*.e1');

          filter.on('op', (doc: OplogDoc) => {
              expect(doc.o.n).to.eq('L1');
              done();
          });
          oplog.tail()
              .then(() => e1.insertOne({ n: 'L1' }))
              .then(() => e2.insertOne({ n: 'L1' }))
              .catch(done);
      });

      it('should filter by the exact namespace', (done) => {
          let cs = db.collection('cs');
          let css = db.collection('css');
          oplog = new MongoOplog(conn.oplog);
          let filter = oplog.filter('optest.cs');

          filter.on('op', (doc: OplogDoc) => {
          if ('L1' !== doc.o.n) { done('should not throw'); }
              else { done(); }
          });
          oplog.tail()
              .then(() => css.insertOne({ n: 'L2' }))
              .then(() => cs.insertOne({ n: 'L1' }))
              .catch(done);
      });
    });

    describe('isCurrent', () => {
        it('should be `true` if no document is found', async () => {
            oplog = new MongoOplog(conn.oplog, {ns: '*.iscurrentnodoc'});
            await oplog.tail();
            expect(await oplog.isCurrent()).to.eq(true);
        }).timeout(5000);

        it('should be `false` if documents inserted but internal ts is off', async () => {
            const ns = 'isnotcurrent';
            oplog = new MongoOplog(conn.oplog, {ns: `*.${ns}`});
            const notCurrent = db.collection(ns);
            await notCurrent.insertOne({n: 'first'});
            expect(await oplog.isCurrent()).to.eq(false);
        }).timeout(5000);

        it('should be `true` if internal ts matches', async () => {
            let pResolve: Function;
            const promise = new Promise((resolve) => pResolve = resolve);
            oplog = new MongoOplog(conn.oplog, {ns: '*.iscurrentinternal'});
            const coll = db.collection('iscurrentinternal');
            oplog.once('insert', () => pResolve());
            coll.insertOne({n: 'I1'});
            await oplog.tail()
                .then(() => promise)
                .then(async () =>
                    expect(await oplog.isCurrent()).to.eq(true)
                )
            ;
        }).timeout(5000);

        it('should be `true` if external ts matches', async () => {
            let pResolve: Function;
            const promise = new Promise((resolve) => pResolve = resolve);
            const ns = 'exttimestamptrue';
            oplog = new MongoOplog(conn.oplog, {ns: `*.${ns}`});
            const coll = db.collection(ns);
            oplog.once('insert', (doc: OplogDoc) => {
                pResolve(doc.ts);
            });
            coll.insertOne({n: 'external ts'});
            await oplog.tail()
                .then(() => promise)
                .then(async (ts: Timestamp) =>
                    expect(await oplog.isCurrent(ts)).to.eq(true)
                )
            ;
        }).timeout(5000);

        it('should throw if external ts supplied and no matching doc', async () => {
            const ns = 'exttsthrow';
            const ts = getTimestamp();
            oplog = new MongoOplog(conn.oplog, {ns: `*.${ns}`});
            try {
                await oplog.isCurrent(ts);
                expect(false).to.eq(true, 'Should have thrown.');
            } catch (err) {
                expect(err.message).to.eq('ERR_NO_DOC');
            }
        }).timeout(5000);
    });

    after((done) => {
        db.dropDatabase(() => {
           client.close(done);
        });
    });
});
