(typeof window !== 'undefined' ? window : global).pico8_gpio = new Array(128).fill(0);

export function RPC({ id, input, output }) {
  function deserializer(data) {
    let result = [];
    let at = 0
    output.forEach(argument => {
      // it annoys me that `at` here is already defined so I can't just `let [next, at] ...`
      let next;
      [next, at] = argument.deserialize(data, at);
      result.push(next);
    });
    return result;
  }

  return function(...args) {
    return {
      data: [id].concat(...args.map((a, i) => input[i].serialize(a))),
      deserializer
    }
  }
}

// An argument datatype is a combination of a serializer and a deserializer.
// The serializer takes the value and returns an array of bytes representing the value.
// The deserializer takes an array of bytes and a position to deserialize from, and returns
// a pair of (the deserialized value, the index of the first byte not consumed)
// the idea here was to set up a bunch of base-level datatypes which can later
// be combined with combinators to create new ones without caring about the
// actual way they work
// another one I'd like to have is a Record/NamedTuple datatype (that would
// deserialize to an object in JS and a table in Lua) but I'm not completely
// sure how I want to handle it yet
export const ArgTypes = {
  Boolean: {
    serialize(b) {
      return [b ? 1 : 0];
    },
    deserialize(input, at) {
      return [input[at] !== 0, at + 1];
    }
  },
  Byte: {
    serialize(n) {
      return [n];
    },
    deserialize(input, at) {
      return [input[at], at + 1];
    }
  },
  // PICO-8 Numbers are 16-bit 2's complement fixed point numbers, with the leading 8 bits
  // representing whole numbers and the trailing 8 bits representing fractional numbers
  Number: {
    serialize(n) {
      let integral = Math.floor(n);
      let fractional = n % 1;
      let negativeBit = 0;
      if (integral < 0) {
        negativeBit = Math.pow(2, 7);
        integral += 32768;
      }
      return [
        Math.floor(integral / 256) | negativeBit,
        integral % 256,
        Math.floor(fractional * 256),
        Math.floor((fractional * 256 * 256) % 256)
      ];
    },
    deserialize(input, at) {
      let [a, b, c, d] = [input[at], input[at + 1], input[at + 2], input[at + 3]];
      let neg = (a & Math.pow(2, 7)) !== 0;
      let negativeAmt = 0;
      if (neg) {
        a &= ~Math.pow(2, 7);
        negativeAmt = -32768;
      }
      return [a * 256 + b + c / 256 + d / (256 * 256) + negativeAmt, at + 4];
    }
  },
  Array: function(type) {
    return {
      serialize(values) {
        return [Math.floor(values.length / 256), values.length % 256].concat(...values.map(type.serialize));
      },
      deserialize(input, at) {
        let length = input[at] * 256 + input[at + 1];
        at += 2;
        let result = [];
        for (let i = 0; i < length; i++) {
          let next;
          [next, at] = type.deserialize(input, at);
          result.push(next);
        }
        return [result, at];
      }
    };
  },
  Tuple: function(...ts) {
    return {
      serialize(values) {
        return [].concat(...ts.map((t, i) => t.serialize(values[i])));
      },
      deserialize(ary, at) {
        let result = [];
        ts.forEach(t => {
          let next;
          [next, at] = t.deserialize(ary, at);
          result.push(next);
        });
        return [result, at];
      }
    };
  },
  String: {
    serialize(values) {
      return [
        Math.floor(values.length / 256), values.length % 256,
        ...values.split('').map(c => c.charCodeAt(0))
      ];
    },
    deserialize(ary, at) {
      let length = ary[at] * 256 + ary[at + 1];
      let result = '';
      at += 2;
      for (let i = 0; i < length; i++) {
        result += String.fromCharCode(ary[at + i]);
      }
      return [result, at + length];
    }
  },
  // this lets a type pretend to be an Unspecified, which is equivalent to Array(Byte).
  Unspecify: function(t) {
    return {
      serialize(values) {
        let serialized = t.serialize(values);
        return [Math.floor(serialized.length / 256), serialized.length % 256, ...serialized];
      },
      deserialize(ary, at) {
        return t.deserialize(ary, at + 2);
      }
    }
  }
};

ArgTypes.Unspecified = ArgTypes.Array(ArgTypes.Byte);

const READY_FOR_CONSUMPTION = 1 << 0
const WRITTEN_BY_JAVASCRIPT = 1 << 1;
const PICO8_LOCK     = 1 << 2;

const HEADER = 1;
const USABLE_GPIO_SPACE = 127;

// this is generalized and exported only so it can be tested
export function _makeReader({ gpio, subscribe }) {
  let listener;

  let processByte = (function*() {
    while (true) {
      // get to the header byte...
      while ((yield) === 0) {}
      let length = (yield);
      length = length * 256 + (yield);
      let nextMessage = new Array(length);
      for (let i = 0; i < length; i++) {
        nextMessage[i] = (yield);
      }
      if (listener) {
        listener(nextMessage);
      }
    }
  })();
  processByte.next();

  function tick() {
    if ((gpio[0] & READY_FOR_CONSUMPTION)
        && !(gpio[0] & WRITTEN_BY_JAVASCRIPT)
        && !(gpio[0] & PICO8_LOCK)) {
      gpio.slice(1).forEach(b => processByte.next(b));
      gpio[0] &= ~READY_FOR_CONSUMPTION;
    }
  }

  return function(cb) {
    // in theory, we can support multiple clients at once, although due to
    // the global nature of communication through pico8_gpio, I think that
    // might cause problems in some situations?  regardless, I don't see a
    // strong use-case for multiple connect() calls so for now I'm going to
    // disallow it.
    if (listener) {
      throw new Error("Don't make a new call to connect() without stop()ping the old one");
    }
    listener = cb;
    let subscription = subscribe(tick);
    return function() {
      subscription();
      listener = null;
    };
  };
}
//
// there's a lot of global/stateful stuff going on in this module, but I think
// that's more or less unavoidable since we're inherently communicating with a
// global/stateful array.
// I do think it could be maybe handled/controlled a little more cleanly than
// it is here though...

let readerPollingListener = null;
let polling = false;

function startPolling(listener) {
  if (polling) {
    throw new Error("Trying to start polling when already polling");
  }
  readerPollingListener = listener;
  polling = true;
  requestAnimationFrame(poll);
}

let writeQueue = [];
function writer(data) {
  writeQueue.push(HEADER, Math.floor(data.length / 256), data.length % 256, ...data);
}

function writeToGPIO(data) {
  pico8_gpio.fill(0);
  pico8_gpio[0] = WRITTEN_BY_JAVASCRIPT | READY_FOR_CONSUMPTION;
  for (let i = 0; i < data.length; i++) {
    pico8_gpio[i + 1] = data[i];
  }
}

function isGPIOWritable() {
  return !(pico8_gpio[0] & READY_FOR_CONSUMPTION) & !(pico8_gpio[0] & PICO8_LOCK);
}

function writeToGPIOIfPossible() {
  if (writeQueue.length > 0 && isGPIOWritable()) {
    writeToGPIO(writeQueue.splice(0, USABLE_GPIO_SPACE));
  }
}

function poll() {
  if (polling) {
    // This polling loop feels a little weird to me since readerPollingListener
    // is set dynamically and writeToGPIOIfPossible is static, I think maybe if
    // we just keep polling while the writeQueue is nonempty it might feel a
    // little better but I'm unsure
    readerPollingListener();
    writeToGPIOIfPossible();
    requestAnimationFrame(poll);
  }
}

function stopPolling() {
  readerPollingListener = null;
  polling = false;
}

let reader = _makeReader({
  gpio: pico8_gpio,
  subscribe: tick => {
    startPolling(tick);
    return stopPolling;
  }
});

// I would have thought you could just inline this but I guess my understanding
// of ES6 default args/destructuring is lacking
let defaultReaderWriter = { reader, writer };

export function connect({ reader, writer }=defaultReaderWriter) {
  let pendingInvocations = {};
  let subscription = reader(function(data) {
    let [id, ...contents] = data;
    if (!pendingInvocations.hasOwnProperty(id)) {
      throw new Error(`Got a response for non-expected message with id '${id}'`);
    }
    let invocation = pendingInvocations[id];
    delete pendingInvocations[id];
    invocation.resolve(invocation.deserializer(contents));
  });

  let nextId = 0;
  return {
    send: function({ deserializer, data }) {
      return new Promise(function(resolve, reject) {
        while (pendingInvocations.hasOwnProperty(nextId)) {
          nextId = (nextId + 1) % 256;
        }
        writer([nextId, ...data]);
        pendingInvocations[nextId] = { resolve, deserializer };
      });
    },
    stop: function() {
      // unsubscribe to the reader (because we might be polling at 60fps)
      subscription();
    }
  };
}
