export function RPC({ id, input, output }) {
  let createInvocation;
  createInvocation = function(...args) {
    return {
      data: [id].concat(...args.map((a, i) => input[i].serialize(a))),
      rpc: createInvocation
    }
  }
  createInvocation.deserializeResult = function(data) {
    let result = [];
    output.map(argument => {
      let next;
      [next, data] = argument.deserialize(data);
      result.push(next);
    });
    return [result, data];
  }
  return createInvocation;
}

export const ArgTypes = {
  Byte: {
    serialize(n) {
      return [n];
    },
    deserialize([n, ...rest]) {
      return [n, rest];
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
    deserialize([a, b, c, d, ...rest]) {
      let neg = (a & Math.pow(2, 7)) !== 0;
      let negativeAmt = 0;
      if (neg) {
        a = a & (~Math.pow(2, 7));
        negativeAmt = -32768;
      }
      return [a * 256 + b + c / 256 + d / (256 * 256) + negativeAmt, rest];
    }
  },
  Array: function(type) {
    return {
      serialize(values) {
        return [Math.floor(values.length / 256), values.length % 256].concat(...values.map(type.serialize));
      },
      deserialize([len1, len2, ...values]) {
        let length = len1 * 256 + len2;
        let result = [];
        for (let i = 0; i < length; i++) {
          let next;
          [next, values] = type.deserialize(values);
          result.push(next);
        }

        return [result, values];
      }
    }
  },
};

let listeners = [];

let theScheduler = scheduler({
  write: function(data) {
    window.pico8_gpio.fill(0);
    window.pico8_gpio[0] = 3;
    for (let i = 0; i < data.length; i++) {
      window.pico8_gpio[i + 1] = data[i];
    }
  },
  writable: () => {
    return !(window.pico8_gpio[0] & 2);j
  }
});
function defaultWriter(id, data) {
  theScheduler.send({ id, data });
}

function poll() {
  for (let i = 0; i < listeners.length; i++) {
    listeners[i]();
  }
  theScheduler.tick();
  if (polling) {
    requestAnimationFrame(poll);
  }
}

let polling = false;
function startPolling() {
  if (polling) return;
  polling = true;
  requestAnimationFrame(poll);
}

export function makeReader({ check, consume, subscribe }) {
  let listeners = [];
  let subscription;
  let reader;
  reader = function(cb) {
    if (listeners.length === 0) {
      subscription = subscribe(reader.tick);
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

  function *receive() {
    while (true) {
      // get to the header bit...
      while ((yield) === 0) {}
      let length = (yield);
      length = length * 256 + (yield);
      let next = [];
      for (let i = 0; i < length; i++) {
        next.push(yield);
      }
      listeners.forEach(l => l(next));
    }
  }

  let receiver = receive();
  receiver.next();
  reader.tick = function() {
    let ary = check();
    if ((ary[0] & 1) && !(ary[0] & 2)) {
      ary.slice(1).forEach(b => receiver.next(b));
      consume();
    }
  }

  return reader;
}


let unsub;
let reader = makeReader({
  check: () => pico8_gpio,
  consume: () => { pico8_gpio[0] &= ~1; },
  subscribe: (tick) => {
    unsub = listeners.push(tick);
    startPolling(tick);
  },
  unsubscribe: () => {
    unsub();
  }
});

export function connect(args={ reader, writer: defaultWriter }) {
  (typeof window !== 'undefined' ? window : global).pico8_gpio = new Array(128).fill(0);
  let reader = args.reader;
  let writer = args.writer;
  let subscription = reader(function(data) {
    let [id, ...contents] = data;
    if (!pendingInvocations.hasOwnProperty(id)) {
      throw new Error(`Got a response for non-expected message with id '${id}'`);
    }
    let invocation = pendingInvocations[id];
    delete pendingInvocations[id];
    invocation.resolve(invocation.rpc.deserializeResult(contents)[0]);
  });

  let pendingInvocations = {};
  let nextId = 0;

  return {
    send: function({ rpc, data }) {
      return new Promise(function(resolve, reject) {
        while (pendingInvocations.hasOwnProperty(nextId)) {
          // need to update this to be fancier sometime
          nextId = (nextId + 1) % 256;
        }
        let id = nextId;
        writer(id, data);
        pendingInvocations[id] = { resolve, reject, id, rpc };
      });
    },
    stop: function() {
      // unsubscribe to the reader (because we might be polling at 60fps)
      subscription();
    }
  };
}

function encode({ id, data }) {
  let length = data.length + 1; // + 1 for id
  return [1, Math.floor(length / 256), length % 256, id, ...data];
}

export function scheduler({ write, writable, usableBufferSize=127 }) {
  let writeQueue = [];

  return {
    send: function(message) {
      writeQueue.push(...encode(message));
    },
    tick: function() {
      if (writeQueue.length > 0 && writable()) {
        write(writeQueue.splice(0, usableBufferSize));
      }
    }
  };
}
