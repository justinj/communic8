export function RPC(spec) {
  let serialize;
  serialize = function(...args) {
    return {
      data: [spec.id].concat(...args.map((a, i) => spec.args[i].serialize(a))),
      rpc: serialize
    }
  }
  // sort of ugly? but we want the function syntax for end-users
  serialize.deserializeResult = function(data) {
    let result = [];
    for (let i = 0; i < spec.ret.length; i++) {
      let next;
      [next, data] = spec.ret[i].deserialize(data);
      result.push(next);
    }
    return [result, data];
  }
  return serialize;
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
function defaultReader(cb) {
  listeners.push(cb);
  startPolling();
  return function() {
    listeners.filter(l => l !== cb);
    if (listeners.length === 0) {
      polling = false;
    }
  }
}

function poll() {
  if ((window.pico8_gpio[0] & 1) && (window.pico8_gpio[0] & 2)) { 
    window.pico8_gpio[0] &= ~2;
    listeners.forEach(l => l(window.pico8_gpio.slice(1)));
  } else if (writeQueue.length > 0 && !(window.pico8_gpio[0] & 2)) {
    let data = writeQueue.pop();
    window.pico8_gpio[0] = 2;
    console.log('writing', data);
    for (let i = 0; i < data.length; i++) {
      window.pico8_gpio[i + 1] = data[i];
    }
  }
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

let writeQueue = [];
function defaultWriter(data) {
  writeQueue.push(data);
}

export function connect(args={ reader: defaultReader, writer: defaultWriter}) {
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
        writer([id, ...data]);
        pendingInvocations[id] = { resolve, reject, id, rpc };
      });
    },
    stop: function() {
      // unsubscribe to the reader (because we might be polling at 60fps)
      subscription();
    }
  };
}
