(typeof window !== 'undefined' ? window : global).pico8_gpio = new Array(128).fill(0);

export function RPC({ id, input, output }) {
  function deserializer(data) {
    let result = [];
    let at = 0
    output.forEach(argument => {
      let next;
      [next, at] = argument.deserialize(data, at);
      result.push(next);
    });
    return [result, data];
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
        a &= (~Math.pow(2, 7));
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
  }
};

const READY_FOR_CONSUMPTION = 1 << 0
const WRITTEN_BY_JAVASCRIPT = 1 << 1;

const HEADER = 1;
const USABLE_GPIO_SPACE = 127;

let writeQueue = [];

function defaultWriter(id, data) {
  let length = data.length + 1; // + 1 for id
  let message = [HEADER, Math.floor(length / 256), length % 256, id, ...data];
  writeQueue.push(...message);
}

export function _makeReader({ gpio, subscribe }) {
  let listeners = [];

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
      listeners.forEach(l => l(nextMessage));
    }
  })();
  processByte.next();

  function tick() {
    if ((gpio[0] & READY_FOR_CONSUMPTION) && !(gpio[0] & WRITTEN_BY_JAVASCRIPT)) {
      gpio.slice(1).forEach(b => processByte.next(b));
      gpio[0] &= ~READY_FOR_CONSUMPTION;
    }
  }

  let subscription;
  return function(cb) {
    if (listeners.length === 0) {
      subscription = subscribe(tick);
    }
    listeners.push(cb);
    return function() {
      listeners = listeners.filter(l => l !== cb);
      if (listeners.length === 0 && subscription) {
        subscription();
        subscription = null;
      }
    }
  };
}

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

function stopPolling() {
  readerPollingListener = null;
  polling = false;
}

let reader = _makeReader({
  gpio: pico8_gpio,
  subscribe: (tick) => {
    startPolling(tick);
    return stopPolling;
  }
});

function poll() {
  if (!polling) {
    return;
  }
  readerPollingListener();
  if (writeQueue.length > 0 && isGPIOWritable()) {
    writeToGPIO(writeQueue.splice(0, USABLE_GPIO_SPACE));
  }
  requestAnimationFrame(poll);
}

export function connect(args={ reader, writer: defaultWriter }) {
  let reader = args.reader;

  let pendingInvocations = {};
  let nextId = 0;

  let subscription = reader(function(data) {
    let [id, ...contents] = data;
    if (!pendingInvocations.hasOwnProperty(id)) {
      throw new Error(`Got a response for non-expected message with id '${id}'`);
    }
    let invocation = pendingInvocations[id];
    delete pendingInvocations[id];
    invocation.resolve(invocation.deserializer(contents)[0]);
  });

  return {
    send: function({ deserializer, data }) {
      return new Promise(function(resolve, reject) {
        while (pendingInvocations.hasOwnProperty(nextId)) {
          // need to update this to be fancier sometime
          nextId = (nextId + 1) % 256;
        }
        let id = nextId;
        args.writer(id, data);
        pendingInvocations[id] = { resolve, id, deserializer };
      });
    },
    stop: function() {
      // unsubscribe to the reader (because we might be polling at 60fps)
      subscription();
    }
  };
}

function writeToGPIO(data) {
  window.pico8_gpio.fill(0);
  window.pico8_gpio[0] = WRITTEN_BY_JAVASCRIPT | READY_FOR_CONSUMPTION;
  for (let i = 0; i < data.length; i++) {
    window.pico8_gpio[i + 1] = data[i];
  }
}

function isGPIOWritable() {
  return !(window.pico8_gpio[0] & READY_FOR_CONSUMPTION);
}
