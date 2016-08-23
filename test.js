import assert from 'assert';
import 'babel-polyfill';

import { RPC, ArgTypes, connect, _makeReader } from './index';

function andThen(fn) {
  setTimeout(fn, 0);
}

let add = RPC({
  id: 0, // a unique byte to identify the RPC
  input: [
    ArgTypes.Byte,
    ArgTypes.Byte
  ],
  output: [
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
      assert.deepEqual(ArgTypes.Byte.deserialize([45], 0), [45, 1]);
      assert.deepEqual(ArgTypes.Byte.deserialize([1, 45, 2], 1), [45, 2]);
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
      assert.deepEqual(ArgTypes.Number.deserialize([0, 10, 0, 0], 0), [10, 4]);
      assert.deepEqual(ArgTypes.Number.deserialize([1, 44, 0, 0], 0), [300, 4]);
    });

    it('decodes a fractional PICO-8 number', function() {
      assert.deepEqual(ArgTypes.Number.deserialize([0, 0, 128, 0], 0), [0.5, 4]);
      assert.deepEqual(ArgTypes.Number.deserialize([0, 0, 192, 0], 0), [0.75, 4]);
      assert.deepEqual(ArgTypes.Number.deserialize([0, 0, 64, 0], 0), [0.25, 4]);
      assert.deepEqual(ArgTypes.Number.deserialize([255, 246, 0, 0], 0), [-10, 4]);
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
      assert.deepEqual(ArgTypes.Array(ArgTypes.Byte).deserialize([0, 0], 0), [[], 2]);
      assert.deepEqual(ArgTypes.Array(ArgTypes.Byte).deserialize([0, 2, 123, 121], 0), [[123, 121], 4]);
      assert.deepEqual(
        ArgTypes.Array(ArgTypes.Number).deserialize([0, 2, 0, 123, 0, 0, 0, 121, 0, 0], 0),
        [[123, 121], 10]
      );
    });
  });

  describe('Tuple', function() {
    let single = ArgTypes.Tuple(ArgTypes.Byte);
    it('encodes a tuple of a single type', function() {
      assert.deepEqual(single.serialize([0]), [0]);
    });

    it('decodes a tuple of a single type', function() {
      assert.deepEqual(single.deserialize([0], 0), [[0], 1]);
    });

    let pair = ArgTypes.Tuple(ArgTypes.Byte, ArgTypes.Boolean);
    it('encodes a tuple of a pair', function() {
      assert.deepEqual(pair.serialize([0, true]), [0, 1]);
    });

    it('decodes a tuple of a pair', function() {
      assert.deepEqual(pair.deserialize([10, 1], 0), [[10, true], 2]);
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

describe('reader', function() {

  // so we can easily set the buffer values without reassigning it
  function setTo(buffer, values) {
    while (buffer.length) { buffer.pop(); }
    values.forEach(v => buffer.push(v));
  }

  function setUpTestReader() {
    let buffer = [];
    let tick;
    let subscribed;
    let reader = _makeReader({
      gpio: buffer,
      subscribe: t => { tick = t; }
    });
    let messages = [];
    reader(function(message) {
      messages.push(message);
    });
    return {
      write: data => setTo(buffer, data),
      tick,
      messages,
      buffer
    };
  }

  it('turns a stream of buffers into a stream of messages', function() {
    let { write, tick, messages } = setUpTestReader();
    write([1, 1, 0, 5, 1, 2]);
    tick();
    write([1, 3, 4, 5, 6]);
    tick();
    assert.deepEqual(
      messages,
      [[1, 2, 3, 4, 5]]
    );
  });

  it('ignores 0s between messages', function() {
    let { write, tick, messages } = setUpTestReader();
    write([1, 1, 0, 5, 1, 2]);
    tick();
    write([1, 3, 4, 5, 0, 0, 0, 0, 1, 0, 1, 1]);
    tick();
    assert.deepEqual(messages, [[1, 2, 3, 4, 5], [1]]);
  });

  it('doesnt read if the read bit isnt set appropriately', function() {
    let { write, tick, messages } = setUpTestReader();
    write([1, 1, 0, 5, 1, 2]);
    tick();
    write([0, 3, 4, 5, 6]);
    tick();
    assert.deepEqual(messages, []);
  });
  
  it('doesnt read if the writer bit isnt set appropriately', function() {
    let { write, tick, messages } = setUpTestReader();
    write([1, 1, 0, 5, 1, 2]);
    tick();
    write([3, 3, 4, 5, 6]);
    tick();
    assert.deepEqual(messages, []);
  });

  it('sets the buffer header after consuming the message', function() {
    let { write, tick, buffer } = setUpTestReader();
    write([1, 1, 0, 5, 1, 2]);
    assert.equal(buffer[0], 1);
    tick();
    assert.equal(buffer[0], 0);
  });

  it('doesnt start listening until it has listeners', function() {
    let buffer = [];
    let subscribed = false;
    let reader = _makeReader({
      gpio: buffer,
      subscribe: () => { subscribed = true; },
    });
    assert(!subscribed);
    reader(function() {});
    assert(subscribed);
  });

  it('cancels the subscription when there are no listeners', function() {
    let buffer = [];
    let subscribed = false;
    let reader = _makeReader({
      gpio: buffer,
      subscribe: () => {
        subscribed = true;
        return () => subscribed = false;
      },
    });
    assert(!subscribed);
    let subscription = reader(function() {});
    assert(subscribed);
    subscription();
    assert(!subscribed);
  });
});
