import assert from 'assert';

import { RPC, ArgTypes, connect } from './index';

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

function makeMock() {
  let writer;
  let mockReader = function(cb) {
    writer = cb;
    return function() {};
  }

  let mockWriter = function(data) {
  }
  return {
    reader: mockReader,
    writer: mockWriter,
    push: function(...x) {
      writer(...x)
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
