/**
 * Module dependencies.
 */
import { getDbConnection, timeout } from '../src/util';
import { expect } from 'chai';
import * as mocha from 'mocha';
import { Cursor, Db, MongoClient } from 'mongodb';
import { createInstance, MongoOplog, OplogDoc } from '../src';

const conn = {
    mongo: 'mongodb://127.0.0.1:27017/optest',
    oplog: 'mongodb://127.0.0.1:27017/local',
    error: 'mongodb://127.0.0.1:8888/error'
};

describe('mongo-oplog', () => {
    let db: Db;
    before(async () => {
        db = await getDbConnection(conn.mongo);
    });

    it('should be a function', () => {
        expect(createInstance).to.be.an('function');
        expect(MongoOplog).to.be.an('function');
    });

    it('should have required methods', () => {
        let oplog = new MongoOplog();
        expect(typeof oplog.tail).to.eq('function');
        expect(typeof oplog.stop).to.eq('function');
        expect(typeof oplog.filter).to.eq('function');
        expect(typeof oplog.destroy).to.eq('function');
    });

    it('should accept mongodb object as connection', async () => {
        const database = await getDbConnection(conn.oplog);
        let oplog = new MongoOplog(database);
        expect(oplog.db).to.eq(database);
    });

    it('should emit `op` event', async () => {
        let coll = db.collection('a');
        let oplog = new MongoOplog(conn.oplog, { ns: 'optest.a' });
        await oplog.tail().then(() => coll.insert({n: "JB", c: 1}));
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
        let oplog = new MongoOplog(conn.oplog, { ns: 'optest.b' });
        oplog.on("insert", (doc: OplogDoc) => {
            expect(doc.op).to.eq('i');
            expect(doc.o.n).to.eq('JBL');
            expect(doc.o.c).to.eq(1);
            done();
        });
        oplog.tail()
            .then(() => coll.insert({n: "JBL", c: 1}))
            .catch(done);
    });

    it('should emit `update` event', (done) => {
        let coll = db.collection('c');
        let oplog = new MongoOplog(conn.oplog, { ns: 'optest.c' });
        oplog.on("update", (doc: OplogDoc) => {
            expect(doc.op).to.eq('u');
            expect(doc.o.$set.n).to.eq('US');
            expect(doc.o.$set.c).to.eq(7);
            done();
        });
        oplog.tail()
            .then(() => coll.insert({n: "CR", c: 3}))
            .then(() => coll.update(
                {_id: {$exists: true}, n: "CR", c: 3}, {$set: {n: "US", c: 7}}
            )).catch(done);
    });

    it('should emit `delete` event', (done) => {
        let coll = db.collection('d');
        let oplog = new MongoOplog(conn.oplog, { ns: 'optest.d' });
        let id: any;
        oplog.tail()
            .then(x => coll.insert({ n: 'PM', c: 4 }))
            .then(doc => {
                id = (doc.ops || doc)[0]._id;
                return coll.remove({_id: {$exists: true}, n: 'PM', c: 4 });
            })
            .catch(done);
        oplog.on("delete", (doc: OplogDoc) => {
            expect(doc.op).to.eq('d');
            expect(doc.o._id.toString()).to.eq(id.toString());
            done();
        });
    });

    it('should emit cursor `end` event', (done) => {
        let oplog = new MongoOplog(conn.oplog);
        oplog.once("end", done);
        oplog.tail()
          .then((stream) => stream.emit("end"))
          .catch(done);
    });

    it('should emit `error` event', (done) => {
        let oplog = new MongoOplog(conn.error);
        oplog.on('error', (err: Error) => {
            expect(err).instanceof(Error);
            done();
        });
        oplog.tail().catch(done);
    });


    it('should filter by namespace in constructor', (done) => {
        let f1 = db.collection('f1');
        let f2 = db.collection('f2');
        let oplog = new MongoOplog(conn.oplog, { ns: '*.f1' });
        oplog.on('op', (doc: OplogDoc) => {
            expect(doc.o.n).to.eq('L2');
            done();
        });
        oplog.tail()
          .then(() => f1.insert({ n: 'L2' }))
          .then(() => f2.insert({ n: 'L2' }))
          .catch(done);
    });


    it('should stop tailing', async () => {
        let coll = db.collection('stoptail');
        let oplog = new MongoOplog(conn.oplog, { ns: '*.stoptail' });
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
            .then(() => coll.insert({ n: 'CR' }))
            .then(() => stopped)
            .then(() => coll.insert({ n: 'CR' }))
            .then(async() => {
                await timeout(10);
                expect(count).to.eq(1);
            });
    });

    it('should destroy oplog', (done) => {
        let coll = db.collection('i');
        let oplog = new MongoOplog(conn.oplog);
        oplog.on('op', (doc: OplogDoc) => {
            oplog.destroy().then(() => done());
        });
        oplog.tail()
            .then(() => coll.insert({ n: 'CR' }))
            .then(() => coll.insert({ n: 'CR' }))
            .catch(done);
    });

    it('should ignore oplog op events', (done) => {
        let coll = db.collection('j');
        let oplog = new MongoOplog(conn.oplog, { ns: '*.j' });
        oplog.on('op', (doc: OplogDoc) => {
            oplog.ignore = true;
            done();
        });
        oplog.tail()
            .then(() => coll.insert({ n: 'CR' }))
            .then(() => {
                coll.insert({ n: 'CR' });
            })
            .catch(done);
    });

    it('should stop tailing', (done) => {
        let coll = db.collection('h');
        let oplog = new MongoOplog(conn.oplog, { ns: '*.h' });
        oplog.on('op', (doc: OplogDoc) => {
            oplog.stop();
            done();
        });
        oplog.tail()
            .then(() => coll.insert({ n: 'CR' }))
            .then(() => coll.insert({ n: 'CR' }))
            .catch(done);
    });

    it('should start from last ts when re-tailing', async () => {
        let c = 0;
        let coll = db.collection('restartfromts');
        let oplog = new MongoOplog(conn.oplog, { ns: 'optest.restartfromts' });
        let res3: Function, promise3 = new Promise<any>((resolve) => res3 = resolve);
        let res6: Function, promise6 = new Promise<any>((resolve) => res6 = resolve);
        oplog.on('op', (doc: OplogDoc) => {
            const val = doc.o.c;
            if (val === 3) { res3(); }
            else if (val === 6) { res6(); }
            expect(val).to.eq(++c);
        });

        return oplog.tail().then(async () => {
                await coll.insert({ c: 1 });
                await coll.insert({ c: 2 });
                await coll.insert({ c: 3 });
                return promise3;
            })
            .then(() => oplog.stop())
            .then(async () => {
                await coll.insert({ c: 4 });
                await coll.insert({ c: 5 });
                await coll.insert({ c: 6 });
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
        let oplog = new MongoOplog(conn.oplog, { ns: 'optest.retailonstop' });
        let values: any = {};
        let valueSize = 0;
        let res3: Function, promise3 = new Promise<any>((resolve) => res3 = resolve);
        let res6: Function, promise6 = new Promise<any>((resolve) => res6 = resolve);
        let stream: Cursor;
        oplog.on('op', (doc: OplogDoc) => {
            const value = doc.o.c;
            expect(value).to.eq(++c);
            if (c === 3) { res3(); }
            else if (c === 6) { res6(); }
        });
        return oplog.tail()
            .then(async (_stream) => {
                stream = _stream;
                stream.on('error', async () => {
                    await coll.insert({c: 4});
                    await coll.insert({c: 5});
                    await coll.insert({c: 6});
                });
            })
            .then(async () => {
                await coll.insert({ c: 1 });
                await coll.insert({ c: 2 });
                await coll.insert({ c: 3 });
                return promise3;
            })
            // Mimic a timeout error
            .then(() => {
                stream.emit('error', new Error('cursor killed or timed out'));
                stream.close();
                return promise6;
            });
    });

    it('should not throw if `destroy` called before connecting', async () => {
        const oplog = new MongoOplog();
        await oplog.destroy();
    });

    describe('filter tests', () => {
      it('should destroy filter', (done) => {
          let coll = db.collection('g');
          let oplog = new MongoOplog(conn.oplog);
          let filter = oplog.filter('*.g');
          filter.on('op', (doc: OplogDoc) => {
              filter.destroy();
              done();
          });
          oplog.tail()
              .then(() => coll.insert({ n: 'CR' }))
              .then(() => coll.insert({ n: 'CR' }))
              .catch(done);
      });

      it('should ignore filter op events', (done) => {
          let coll = db.collection('k');
          let oplog = new MongoOplog(conn.oplog);
          let filter = oplog.filter('*.k');

          filter.on('op', (doc: OplogDoc) => {
              filter.ignore = true;
              done();
          });

          oplog.tail()
              .then(() => coll.insert({ n: 'CR' }))
              .then(() => coll.insert({ n: 'CR' }))
              .catch(done);
      });

      it('should filter by collection', (done) => {
          let e1 = db.collection('e1');
          let e2 = db.collection('e2');
          let oplog = new MongoOplog(conn.oplog);

          let filter = oplog.filter('*.e1');

          filter.on('op', (doc: OplogDoc) => {
              expect(doc.o.n).to.eq('L1');
              done();
          });
          oplog.tail()
              .then(() => e1.insert({ n: 'L1' }))
              .then(() => e2.insert({ n: 'L1' }))
              .catch(done);
      });

      it('should filter by the exact namespace', (done) => {
          let cs = db.collection('cs');
          let css = db.collection('css');
          let oplog = new MongoOplog(conn.oplog);
          let filter = oplog.filter('optest.cs');

          filter.on('op', (doc: OplogDoc) => {
          if ('L1' !== doc.o.n) { done('should not throw'); }
              else { done(); }
          });
          oplog.tail()
              .then(() => css.insert({ n: 'L2' }))
              .then(() => cs.insert({ n: 'L1' }))
              .catch(done);
      });

    });
    after((done) => {
        db.dropDatabase(() => {
           db.close(done);
        });
    });
});
