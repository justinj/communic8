'use strict';

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; })();

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RPC = RPC;
exports.connect = connect;

function _toArray(arr) { return Array.isArray(arr) ? arr : Array.from(arr); }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function RPC(spec) {
  var serialize = undefined;
  serialize = function () {
    var _ref;

    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return {
      data: (_ref = [spec.id]).concat.apply(_ref, _toConsumableArray(args.map(function (a, i) {
        return spec.args[i].serialize(a);
      }))),
      rpc: serialize
    };
  };
  // sort of ugly? but we want the function syntax for end-users
  serialize.deserializeResult = function (data) {
    var result = [];
    for (var i = 0; i < spec.ret.length; i++) {
      var next = undefined;

      var _spec$ret$i$deseriali = spec.ret[i].deserialize(data);

      var _spec$ret$i$deseriali2 = _slicedToArray(_spec$ret$i$deseriali, 2);

      next = _spec$ret$i$deseriali2[0];
      data = _spec$ret$i$deseriali2[1];

      result.push(next);
    }
    return [result, data];
  };
  return serialize;
}

var ArgTypes = exports.ArgTypes = {
  Byte: {
    serialize: function serialize(n) {
      return [n];
    },
    deserialize: function deserialize(_ref2) {
      var _ref3 = _toArray(_ref2);

      var n = _ref3[0];

      var rest = _ref3.slice(1);

      return [n, rest];
    }
  },
  Number: {
    serialize: function serialize(n) {
      var integral = Math.floor(n);
      var fractional = n % 1;
      var negativeBit = 0;
      if (integral < 0) {
        negativeBit = Math.pow(2, 7);
        integral += 32768;
      }
      return [Math.floor(integral / 256) | negativeBit, integral % 256, Math.floor(fractional * 256), Math.floor(fractional * 256 * 256 % 256)];
    },
    deserialize: function deserialize(_ref4) {
      var _ref5 = _toArray(_ref4);

      var a = _ref5[0];
      var b = _ref5[1];
      var c = _ref5[2];
      var d = _ref5[3];

      var rest = _ref5.slice(4);

      var neg = (a & Math.pow(2, 7)) !== 0;
      var negativeAmt = 0;
      if (neg) {
        a = a & ~Math.pow(2, 7);
        negativeAmt = -32768;
      }
      return [a * 256 + b + c / 256 + d / (256 * 256) + negativeAmt, rest];
    }
  },
  Array: function Array(type) {
    return {
      serialize: function serialize(values) {
        var _ref6;

        return (_ref6 = [Math.floor(values.length / 256), values.length % 256]).concat.apply(_ref6, _toConsumableArray(values.map(type.serialize)));
      },
      deserialize: function deserialize(_ref7) {
        var _ref8 = _toArray(_ref7);

        var len1 = _ref8[0];
        var len2 = _ref8[1];

        var values = _ref8.slice(2);

        var length = len1 * 256 + len2;
        var result = [];
        for (var i = 0; i < length; i++) {
          var next = undefined;

          var _type$deserialize = type.deserialize(values);

          var _type$deserialize2 = _slicedToArray(_type$deserialize, 2);

          next = _type$deserialize2[0];
          values = _type$deserialize2[1];

          result.push(next);
        }

        return [result, values];
      }
    };
  }
};

var listeners = [];
function defaultReader(cb) {
  listeners.push(cb);
  startPolling();
  return function () {
    listeners.filter(function (l) {
      return l !== cb;
    });
    if (listeners.length === 0) {
      polling = false;
    }
  };
}

function poll() {
  if (window.pico8_gpio[0] & 1 && window.pico8_gpio[0] & 2) {
    window.pico8_gpio[0] &= ~2;
    listeners.forEach(function (l) {
      return l(window.pico8_gpio.slice(1));
    });
  } else if (writeQueue.length > 0 && !(window.pico8_gpio[0] & 2)) {
    var data = writeQueue.pop();
    window.pico8_gpio[0] = 2;
    console.log('writing', data);
    for (var i = 0; i < data.length; i++) {
      window.pico8_gpio[i + 1] = data[i];
    }
  }
  if (polling) {
    requestAnimationFrame(poll);
  }
}

var polling = false;
function startPolling() {
  if (polling) return;
  polling = true;
  requestAnimationFrame(poll);
}

var writeQueue = [];
function defaultWriter(data) {
  writeQueue.push(data);
}

function connect() {
  var args = arguments.length <= 0 || arguments[0] === undefined ? { reader: defaultReader, writer: defaultWriter } : arguments[0];

  var reader = args.reader;
  var writer = args.writer;
  var subscription = reader(function (data) {
    var _data = _toArray(data);

    var id = _data[0];

    var contents = _data.slice(1);

    if (!pendingInvocations.hasOwnProperty(id)) {
      throw new Error('Got a response for non-expected message with id \'' + id + '\'');
    }
    var invocation = pendingInvocations[id];
    delete pendingInvocations[id];
    invocation.resolve(invocation.rpc.deserializeResult(contents)[0]);
  });

  var pendingInvocations = {};
  var nextId = 0;

  return {
    send: function send(_ref9) {
      var rpc = _ref9.rpc;
      var data = _ref9.data;

      return new Promise(function (resolve, reject) {
        while (pendingInvocations.hasOwnProperty(nextId)) {
          // need to update this to be fancier sometime
          nextId = (nextId + 1) % 256;
        }
        var id = nextId;
        writer([id].concat(_toConsumableArray(data)));
        pendingInvocations[id] = { resolve: resolve, reject: reject, id: id, rpc: rpc };
      });
    },
    stop: function stop() {
      // unsubscribe to the reader (because we might be polling at 60fps)
      subscription();
    }
  };
}
'use strict';

var _index = require('./index');

var add = (0, _index.RPC)({
  id: 0, // a unique byte to identify the RPC
  args: [_index.ArgTypes.Byte, _index.ArgTypes.Byte],
  ret: [_index.ArgTypes.Byte]
});

var sum = (0, _index.RPC)({
  id: 1, // a unique byte to identify the RPC
  args: [_index.ArgTypes.Array(_index.ArgTypes.Byte)],
  ret: [_index.ArgTypes.Byte]
});

var bridge = (0, _index.connect)();

bridge.send(sum([1, 2, 3, 4, 5])).then(function (result) {
  console.log('got 1+2+3+4+5 = ', result);
});

// bridge.send(add(2, 3)).then(result => {
//   console.log('got 2 + 3 to be ', result);
// });
// bridge.send(add(5, 3)).then(result => {
//   console.log('got 5 + 3 to be ', result);
// });
