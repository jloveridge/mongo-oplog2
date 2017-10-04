# mongo-oplog2

Listening to MongoDB live changes using oplog.

## Features

* Support start and stop tailing the MongoDB `oplog` at any time.
* Support filtering `oplog` events by `namespaces` (database and collections).
* Built on top of the native NodeJS [MongoDB driver](https://github.com/mongodb/node-mongodb-native/).
* `Promise` support which enables the use of `async` and `await`.
* The package has a very small footprint and requires just a few dependencies, including `mongodb` and `eventemitter3`.
* Uses `eventemitter3` for high performance event emitting.
* Unit tested with `mocha` and built with `typescript` so bundled types are always up to date.
* Differences from [mongo-oplog](https://github.com/cayasso/mongo-oplog)
  * does not attempt to support older versions of NodeJS; output Javascript targets `es2016`
  * does not have callback support for oplog operations (tail, stop, etc.)
  * built with `typescript`
  * use `new` to create an instance of `MongoOplog` or you can use the default export of `createInstance` which will do this for you
  * supports "pretty" format of emitted documents which conform to the style in [mongo-trigger](https://github.com/afharo/mongo-trigger)

## Installation

``` bash
$ npm install mongo-oplog2
```

## Usage

``` typescript
import {MongoOplog, OplogDoc} from 'mongo-oplog2';
const oplog: MongoOplog = new MongoOplog('mongodb://127.0.0.1:27017/local', { ns: 'test.posts' });

oplog.tail();

oplog.on('op', (data: OplogDoc) => {
  console.log(data);
});

oplog.on('insert', (doc: OplogDoc) => {
  console.log(doc);
});

oplog.on('update', (doc: OplogDoc) => {
  console.log(doc);
});

oplog.on('delete', (doc: OplogDoc) => {
  console.log(doc.o._id);
});

oplog.on('error', (error: Error) => {
  console.log(error);
});

oplog.on('end', () => {
  console.log('Stream ended');
});

oplog.stop().then(() => {
  console.log('server stopped');
});
```

## API

### MongoOplog(uriOrDb, [options])

* `uriOrDb`: Valid MongoDB uri or a MongoDB server instance.
* `options` MongoDB connection options.

### oplog.tail()

Start tailing.
This method only supports `Promise` syntax.

```javascript
oplog.tail().then(() => {
  console.log('tailing started');
}).catch(err => console.error(err));

// or with async/await
async function tail() {
  try {
    await oplog.tail();
    console.log('tailing started');
  } catch (err) {
    console.log(err);
  }
}
```

### oplog.stop()

Stop tailing and disconnect from server.
This method only supports `Promise` syntax.

```javascript
oplog.stop().then(() => {
  console.log('tailing stopped');
}).catch(err => console.error(err));

// or with async/await
async function stop() {
  try {
    await oplog.stop();
    console.log('tailing stopped');
  } catch (err) {
    console.log(err);
  }
}
```

### oplog.destroy()

Destroy the `mongo-oplog` object by stop tailing and disconnecting from server.
This method only supports `Promise` syntax.

```javascript
oplog.destroy.then(() => {
  console.log('destroyed');
}).catch(err => console.error(err));

// or with async/await
async function destroy() {
  try {
    await oplog.destroy();
    console.log('destroyed');
  } catch (err) {
    console.log(err);
  }
}
```

### oplog.ignore

Ignore incoming oplog events.

*NOTE*: This does not prevent the `oplog` itself from progressing the cursor. Any updates during the time between when you start ignoring and stop ignoring will not be sent to your application. The timestamp prior to start of ignore being set is preserved. If you really want to stop receiving events and then start receiving them again without loss you must use `stop` and `tail` instead of simply using `ignore`.

```javascript
oplog.ignore = true; // to stop receiving events
oplog.ignore = false; // to resume receiving events
```

### oplog.filter(ns)

Create and return a filter object.

```javascript
const filter = oplog.filter('*.posts');
filter.on('op', fn);
oplog.tail();
```

### filter.destroy()

Destroy filter object.

```javascript
filter.destroy();
```

### filter.ignore

Ignore / resume filtered events.

*NOTE*: Ignoring events can easily result in missed events. See above.

```javascript
filter.ignore = true; // to ignore events
filter.ignore = false; // to resume recepit of events
```

### events

Events supported by `oplog` and `filter`;

* `op`: All bellow operations (oplog/filter).
* `insert`: Document insert (oplog/filter).
* `update`: Document update (oplog/filter).
* `delete`: Document delete (oplog/filter).
* `end`: Cursor stream ended (oplog).
* `error`: Error (oplog).

## Run tests

Configure MongoDB for active oplog:

Start MongoDB with:

```bash
$ mongod --replSet test
```

Start a `mongo` shell and configure mongo as follows:

```bash
$ mongo
> var config = {_id: "test", members: [{_id: 0, host: "127.0.0.1:27017"}]};
> rs.initiate(config);
```

Once configuration is initiated then you can run the test:

``` bash
$ npm install
$ npm run test
```

## Credits

This is a port of [cayasso](https://github.com/cayasso)'s [mongo-oplog](https://github.com/cayasso/mongo-oplog) module to `typescript`, which guarantees types will always be up to date when using this package in your own TypeScript projects.
Pretty document format is compatible with [mongo-trigger](https://github.com/afharo/mongo-trigger).

## License

(The MIT License)

Copyright (c) 2017 Jarom Loveridge

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
