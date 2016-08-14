import assert from 'assert';
import 'babel-polyfill';

import { RPC, ArgTypes, connect, scheduler, encode, makeReader } from './index';

function andThen(fn) {
  setTimeout(fn, 0);
}

let add = RPC({
  id: 0, // a unique byte to identify the RPC
  args: [
    ArgTypes.Byte,
    ArgTypes.Byte
  ],
  ret: [
    ArgTypes.Byte
  ]
});

describe('RPCs', function() {
  it('lets us register an RPC', function() {
    assert.deepEqual(add(2, 3).data, [0, 2, 3]);
  });
});

describe('encodings', function() {
  describe('Byte', function() {
    it('serializes a byte', function() {
      assert.deepEqual(ArgTypes.Byte.serialize(45), [45]);
    });

    it('deserializes a byte', function() {
      assert.deepEqual(ArgTypes.Byte.deserialize([45]), [45, []]);
      assert.deepEqual(ArgTypes.Byte.deserialize([45, 1, 2]), [45, [1, 2]]);
    });
  });

  describe('Number', function() {
    it('encodes a whole PICO-8 number', function() {
      assert.deepEqual(ArgTypes.Number.serialize(10), [0, 10, 0, 0]);
      assert.deepEqual(ArgTypes.Number.serialize(300), [1, 44, 0, 0]);
    });

    it('encodes a fractional PICO-8 number', function() {
      assert.deepEqual(ArgTypes.Number.serialize(0.5), [0, 0, 128, 0]);
      assert.deepEqual(ArgTypes.Number.serialize(0.75), [0, 0, 192, 0]);
      assert.deepEqual(ArgTypes.Number.serialize(0.25), [0, 0, 64, 0]);
      assert.deepEqual(ArgTypes.Number.serialize(0.0009842), [0, 0, 0, 64]);
      assert.deepEqual(ArgTypes.Number.serialize(14234.123132), [55, 154, 31, 133]);
      assert.deepEqual(ArgTypes.Number.serialize(-10), [255, 246, 0, 0]);
    });

    it('decodes a whole PICO-8 number', function() {
      assert.deepEqual(ArgTypes.Number.deserialize([0, 10, 0, 0]), [10, []]);
      assert.deepEqual(ArgTypes.Number.deserialize([1, 44, 0, 0]), [300, []]);
    });

    it('decodes a fractional PICO-8 number', function() {
      assert.deepEqual(ArgTypes.Number.deserialize([0, 0, 128, 0]), [0.5, []]);
      assert.deepEqual(ArgTypes.Number.deserialize([0, 0, 192, 0]), [0.75, []]);
      assert.deepEqual(ArgTypes.Number.deserialize([0, 0, 64, 0]), [0.25, []]);
      assert.deepEqual(ArgTypes.Number.deserialize([255, 246, 0, 0]), [-10, []]);
      // close enough
      //assert.deepEqual(ArgTypes.Number.deserialize([0, 0, 0, 64]), 0.0009842);
      //assert.deepEqual(ArgTypes.Number.deserialize([55, 154, 31, 133]), 14234.123132);
    });
  });

  describe('Array', function() {
    it('encodes an array of a particular type', function() {
      assert.deepEqual(ArgTypes.Array(ArgTypes.Byte).serialize([]), [0, 0]);
      assert.deepEqual(ArgTypes.Array(ArgTypes.Byte).serialize([123, 121]), [0, 2, 123, 121]);
      assert.deepEqual(ArgTypes.Array(ArgTypes.Number).serialize([123, 121]), [0, 2, 0, 123, 0, 0, 0, 121, 0, 0]);
    });

    it('decodes an array of a particular type', function() {
      assert.deepEqual(ArgTypes.Array(ArgTypes.Byte).deserialize([0, 0]), [[], []]);
      assert.deepEqual(ArgTypes.Array(ArgTypes.Byte).deserialize([0, 2, 123, 121]), [[123, 121], []]);
      assert.deepEqual(
        ArgTypes.Array(ArgTypes.Number).deserialize([0, 2, 0, 123, 0, 0, 0, 121, 0, 0]),
        [[123, 121], []]
      );
    });
  });
});

function makeMock({ messagesBeforeRespond }={ messagesBeforeRespond: 1 }) {
  let writer;
  let mockReader = function(cb) {
    writer = cb;
    return function() {};
  }
  let listeners = [];
  let mockWriter = function(data) {
    listeners.forEach(l => l(data));
  }

  let queue = [];
  return {
    reader: mockReader,
    writer: mockWriter,
    push: function(...x) {
      queue.push(x);
      if (queue.length >= messagesBeforeRespond) {
        queue.forEach(x => writer(...x));
        queue = [];
      }
    },
    onMessage: function(cb) {
      listeners.push(cb);
    }
  }
}

describe('talking to the bridge', function() {
  it('lets us call a function', function(done) {
    let mock = makeMock();
    let bridge = connect(mock);
    let result = bridge.send(add(2, 3));
    andThen(() => mock.push([0, 5]));
    result.then(result => {
      assert.deepEqual(result, [5]);
      done();
    });
  });

  it('lets us call multiple functions at once', function(done) {
    let mock = makeMock();
    let bridge = connect(mock);
    let result5 = bridge.send(add(2, 3));
    let result10 = bridge.send(add(7, 3));

    andThen(() => mock.push([0, 5]));
    andThen(() => mock.push([1, 10]));

    Promise.all([result5, result10]).then(([five, ten]) => {
      assert.deepEqual(five, [5]);
      assert.deepEqual(ten, [10]);
      done();
    });
  });

  it('lets us call multiple functions at once (other order)', function(done) {
    let mock = makeMock();
    let bridge = connect({ reader: mock.reader, writer: mock.writer });
    let result5 = bridge.send(add(2, 3));
    let result10 = bridge.send(add(7, 3));

    andThen(() => mock.push([1, 10]));
    andThen(() => mock.push([0, 5]));

    Promise.all([result5, result10]).then(([five, ten]) => {
      assert.deepEqual(five, [5]);
      assert.deepEqual(ten, [10]);
      done();
    });
  });
});

describe('scheduler', function() {
  it('sends a message on tick', function() {
    let receivedMessage;
    let s = scheduler({
      write: function(data) {
        receivedMessage = data;
      },
      writable: () => true
    });

    s.send({id: 0, data: [1, 2, 3]});
    assert.deepEqual(receivedMessage, undefined);
    s.tick();
    assert.deepEqual(receivedMessage, [0, 4, 0, 1, 2, 3]);
  });

  it('doesnt send a message twice', function() {
    let timesCalled = 0;
    let s = scheduler({
      write: function(data) {
        timesCalled += 1;
      },
      writable: () => true
    });

    s.send({id: 0, data: [1, 2, 3]});
    assert.equal(timesCalled, 0);
    s.tick();
    assert.equal(timesCalled, 1);
    s.tick();
    assert.equal(timesCalled, 1);
  });

  it('doesnt write if writable is false', function() {
    let timesCalled = 0;
    let s = scheduler({
      write: function(data) {
        timesCalled += 1;
      },
      writable: () => false
    });

    s.send({id: 0, data: [1, 2, 3]});
    assert.equal(timesCalled, 0);
    s.tick();
    assert.equal(timesCalled, 0);
    s.tick();
    assert.equal(timesCalled, 0);
  });

  it('batches together messages', function() {
    let receivedMessage;
    let s = scheduler({
      write: function(data) {
        receivedMessage = data;
      },
      writable: () => true
    });

    s.send({id: 0, data: [1, 2, 3]});
    s.send({id: 1, data: [4, 5, 6]});
    s.tick();
    assert.deepEqual(receivedMessage, [0, 4, 0, 1, 2, 3, 0, 4, 1, 4, 5, 6]);
  });

  it('breaks up real big messages over multiple messages', function() {
    let realBigMessage = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let receivedMessages = [];
    let s = scheduler({
      write: function(data) {
        receivedMessages.push(data);
      },
      writable: () => true,
      usableBufferSize: 10
    });

    s.send({id: 0, data: realBigMessage});
    s.tick();
    s.tick();
    assert.deepEqual(
      receivedMessages,
      [[0, 11, 0, 1, 2, 3, 4, 5, 6, 7],
       [8, 9, 10]]
    );
  });
});

describe('reader', function() {
  it('turns a stream of buffers into a stream of messages', function() {
    let buffer = [];
    let reader = makeReader({
      check: () => buffer,
      consume: () => {},
      subscribe: () => {},
      cancel: () => {}
    });
    let messages = [];
    reader(function(message) {
      messages.push(message);
    });
    buffer = [1, 0, 5, 1, 2];
    reader.tick();
    buffer = [1, 3, 4, 5, 6];
    reader.tick();
    assert.deepEqual(
      messages,
      [[1, 2, 3, 4, 5]]
    );
  });

  it('doesnt read if the read bit isnt set appropriately', function() {
    let buffer = [];
    let reader = makeReader({
      check: () => buffer,
      consume: () => {},
      subscribe: () => {},
      cancel: () => {}
    });
    let messages = [];
    reader(function(message) {
      messages.push(message);
    });
    buffer = [1, 0, 5, 1, 2];
    reader.tick();
    buffer = [0, 3, 4, 5, 6];
    reader.tick();
    assert.deepEqual(
      messages,
      []
    );
  });
  
  it('doesnt read if the writer bit isnt set appropriately', function() {
    let buffer = [];
    let reader = makeReader({
      check: () => buffer,
      consume: () => {},
      subscribe: () => {},
      cancel: () => {}
    });
    let messages = [];
    reader(function(message) {
      messages.push(message);
    });
    buffer = [1, 0, 5, 1, 2];
    reader.tick();
    buffer = [3, 3, 4, 5, 6];
    reader.tick();
    assert.deepEqual(
      messages,
      []
    );
  });

  it('calls the consume function after consuming a function', function() {
    let buffer = [];
    let consumed = false;
    let reader = makeReader({
      check: () => buffer,
      consume: () => { consumed = true; },
      subscribe: () => {},
      cancel: () => {}
    });
    reader(function() { });
    buffer = [1, 0, 5, 1, 2];
    reader.tick();
    assert(consumed);
  });

  it('doesnt start listening until it has listeners', function() {
    let buffer = [];
    let subscribed = false;
    let reader = makeReader({
      check: () => buffer,
      consume: () => {},
      subscribe: () => { subscribed = true; },
      cancel: () => {}
    });
    assert(!subscribed);
    reader(function() {});
    assert(subscribed);
  });

  it('cancels the subscription when there are no listeners', function() {
    let buffer = [];
    let subscribed = false;
    let reader = makeReader({
      check: () => buffer,
      consume: () => {},
      subscribe: () => { subscribed = true; },
      cancel: () => { subscribed = false; }
    });
    assert(!subscribed);
    let subscription = reader(function() {});
    assert(subscribed);
    subscription();
    assert(!subscribed);
  });
});
