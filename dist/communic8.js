var Communic8 =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(global) {'use strict';

	var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; })();

	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	exports.RPC = RPC;
	exports._makeReader = _makeReader;
	exports.connect = connect;

	function _toArray(arr) { return Array.isArray(arr) ? arr : Array.from(arr); }

	function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

	(typeof window !== 'undefined' ? window : global).pico8_gpio = new Array(128).fill(0);

	function RPC(_ref) {
	  var id = _ref.id;
	  var input = _ref.input;
	  var output = _ref.output;

	  function deserializer(data) {
	    var result = [];
	    var at = 0;
	    output.forEach(function (argument) {
	      // it annoys me that `at` here is already defined so I can't just `let [next, at] ...`
	      var next = undefined;

	      var _argument$deserialize = argument.deserialize(data, at);

	      var _argument$deserialize2 = _slicedToArray(_argument$deserialize, 2);

	      next = _argument$deserialize2[0];
	      at = _argument$deserialize2[1];

	      result.push(next);
	    });
	    return result;
	  }

	  return function () {
	    var _ref2;

	    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
	      args[_key] = arguments[_key];
	    }

	    return {
	      data: (_ref2 = [id]).concat.apply(_ref2, _toConsumableArray(args.map(function (a, i) {
	        return input[i].serialize(a);
	      }))),
	      deserializer: deserializer
	    };
	  };
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
	var ArgTypes = exports.ArgTypes = {
	  Boolean: {
	    serialize: function serialize(b) {
	      return [b ? 1 : 0];
	    },
	    deserialize: function deserialize(input, at) {
	      return [input[at] !== 0, at + 1];
	    }
	  },
	  Byte: {
	    serialize: function serialize(n) {
	      return [n];
	    },
	    deserialize: function deserialize(input, at) {
	      return [input[at], at + 1];
	    }
	  },
	  // PICO-8 Numbers are 16-bit 2's complement fixed point numbers, with the leading 8 bits
	  // representing whole numbers and the trailing 8 bits representing fractional numbers
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
	    deserialize: function deserialize(input, at) {
	      var a = input[at];
	      var b = input[at + 1];
	      var c = input[at + 2];
	      var d = input[at + 3];

	      var neg = (a & Math.pow(2, 7)) !== 0;
	      var negativeAmt = 0;
	      if (neg) {
	        a &= ~Math.pow(2, 7);
	        negativeAmt = -32768;
	      }
	      return [a * 256 + b + c / 256 + d / (256 * 256) + negativeAmt, at + 4];
	    }
	  },
	  Array: function Array(type) {
	    return {
	      serialize: function serialize(values) {
	        var _ref3;

	        return (_ref3 = [Math.floor(values.length / 256), values.length % 256]).concat.apply(_ref3, _toConsumableArray(values.map(type.serialize)));
	      },
	      deserialize: function deserialize(input, at) {
	        var length = input[at] * 256 + input[at + 1];
	        at += 2;
	        var result = [];
	        for (var i = 0; i < length; i++) {
	          var next = undefined;

	          var _type$deserialize = type.deserialize(input, at);

	          var _type$deserialize2 = _slicedToArray(_type$deserialize, 2);

	          next = _type$deserialize2[0];
	          at = _type$deserialize2[1];

	          result.push(next);
	        }
	        return [result, at];
	      }
	    };
	  },
	  Tuple: function Tuple() {
	    for (var _len2 = arguments.length, ts = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
	      ts[_key2] = arguments[_key2];
	    }

	    return {
	      serialize: function serialize(values) {
	        var _ref4;

	        return (_ref4 = []).concat.apply(_ref4, _toConsumableArray(ts.map(function (t, i) {
	          return t.serialize(values[i]);
	        })));
	      },
	      deserialize: function deserialize(ary, at) {
	        var result = [];
	        ts.forEach(function (t) {
	          var next = undefined;

	          var _t$deserialize = t.deserialize(ary, at);

	          var _t$deserialize2 = _slicedToArray(_t$deserialize, 2);

	          next = _t$deserialize2[0];
	          at = _t$deserialize2[1];

	          result.push(next);
	        });
	        return [result, at];
	      }
	    };
	  },
	  String: {
	    serialize: function serialize(values) {
	      return [Math.floor(values.length / 256), values.length % 256].concat(_toConsumableArray(values.split('').map(function (c) {
	        return c.charCodeAt(0);
	      })));
	    },
	    deserialize: function deserialize(ary, at) {
	      var length = ary[at] * 256 + ary[at + 1];
	      var result = '';
	      at += 2;
	      for (var i = 0; i < length; i++) {
	        result += String.fromCharCode(ary[at + i]);
	      }
	      return [result, at + length];
	    }
	  },
	  // this lets a type pretend to be an Unspecified, which is equivalent to Array(Byte).
	  Unspecify: function Unspecify(t) {
	    return {
	      serialize: function serialize(values) {
	        var serialized = t.serialize(values);
	        return [Math.floor(serialized.length / 256), serialized.length % 256].concat(_toConsumableArray(serialized));
	      },
	      deserialize: function deserialize(ary, at) {
	        return t.deserialize(ary, at + 2);
	      }
	    };
	  }
	};

	ArgTypes.Unspecified = ArgTypes.Array(ArgTypes.Byte);

	var READY_FOR_CONSUMPTION = 1 << 0;
	var WRITTEN_BY_JAVASCRIPT = 1 << 1;
	var PICO8_LOCK = 1 << 2;

	var HEADER = 1;
	var USABLE_GPIO_SPACE = 127;

	// this is generalized and exported only so it can be tested
	function _makeReader(_ref5) {
	  var gpio = _ref5.gpio;
	  var subscribe = _ref5.subscribe;

	  var listener = undefined;

	  var processByte = regeneratorRuntime.mark(function _callee() {
	    var length, nextMessage, i;
	    return regeneratorRuntime.wrap(function _callee$(_context) {
	      while (1) {
	        switch (_context.prev = _context.next) {
	          case 0:
	            if (false) {
	              _context.next = 27;
	              break;
	            }

	          case 1:
	            _context.next = 3;
	            return;

	          case 3:
	            _context.t0 = _context.sent;

	            if (!(_context.t0 === 0)) {
	              _context.next = 7;
	              break;
	            }

	            _context.next = 1;
	            break;

	          case 7:
	            _context.next = 9;
	            return;

	          case 9:
	            length = _context.sent;
	            _context.t1 = length * 256;
	            _context.next = 13;
	            return;

	          case 13:
	            _context.t2 = _context.sent;
	            length = _context.t1 + _context.t2;
	            nextMessage = new Array(length);
	            i = 0;

	          case 17:
	            if (!(i < length)) {
	              _context.next = 24;
	              break;
	            }

	            _context.next = 20;
	            return;

	          case 20:
	            nextMessage[i] = _context.sent;

	          case 21:
	            i++;
	            _context.next = 17;
	            break;

	          case 24:
	            if (listener) {
	              listener(nextMessage);
	            }
	            _context.next = 0;
	            break;

	          case 27:
	          case 'end':
	            return _context.stop();
	        }
	      }
	    }, _callee, this);
	  })();
	  processByte.next();

	  function tick() {
	    if (gpio[0] & READY_FOR_CONSUMPTION && !(gpio[0] & WRITTEN_BY_JAVASCRIPT) && !(gpio[0] & PICO8_LOCK)) {
	      gpio.slice(1).forEach(function (b) {
	        return processByte.next(b);
	      });
	      gpio[0] &= ~READY_FOR_CONSUMPTION;
	    }
	  }

	  return function (cb) {
	    // in theory, we can support multiple clients at once, although due to
	    // the global nature of communication through pico8_gpio, I think that
	    // might cause problems in some situations?  regardless, I don't see a
	    // strong use-case for multiple connect() calls so for now I'm going to
	    // disallow it.
	    if (listener) {
	      throw new Error("Don't make a new call to connect() without stop()ping the old one");
	    }
	    listener = cb;
	    var subscription = subscribe(tick);
	    return function () {
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

	var readerPollingListener = null;
	var polling = false;

	function startPolling(listener) {
	  if (polling) {
	    throw new Error("Trying to start polling when already polling");
	  }
	  readerPollingListener = listener;
	  polling = true;
	  requestAnimationFrame(poll);
	}

	var writeQueue = [];
	function writer(data) {
	  writeQueue.push.apply(writeQueue, [HEADER, Math.floor(data.length / 256), data.length % 256].concat(_toConsumableArray(data)));
	}

	function writeToGPIO(data) {
	  pico8_gpio.fill(0);
	  pico8_gpio[0] = WRITTEN_BY_JAVASCRIPT | READY_FOR_CONSUMPTION;
	  for (var _i = 0; _i < data.length; _i++) {
	    pico8_gpio[_i + 1] = data[_i];
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

	var reader = _makeReader({
	  gpio: pico8_gpio,
	  subscribe: function subscribe(tick) {
	    startPolling(tick);
	    return stopPolling;
	  }
	});

	// I would have thought you could just inline this but I guess my understanding
	// of ES6 default args/destructuring is lacking
	var defaultReaderWriter = { reader: reader, writer: writer };

	function connect() {
	  var _ref6 = arguments.length <= 0 || arguments[0] === undefined ? defaultReaderWriter : arguments[0];

	  var reader = _ref6.reader;
	  var writer = _ref6.writer;

	  var pendingInvocations = {};
	  var subscription = reader(function (data) {
	    var _data = _toArray(data);

	    var id = _data[0];

	    var contents = _data.slice(1);

	    if (!pendingInvocations.hasOwnProperty(id)) {
	      throw new Error('Got a response for non-expected message with id \'' + id + '\'');
	    }
	    var invocation = pendingInvocations[id];
	    delete pendingInvocations[id];
	    invocation.resolve(invocation.deserializer(contents));
	  });

	  var nextId = 0;
	  return {
	    send: function send(_ref7) {
	      var deserializer = _ref7.deserializer;
	      var data = _ref7.data;

	      return new Promise(function (resolve, reject) {
	        while (pendingInvocations.hasOwnProperty(nextId)) {
	          nextId = (nextId + 1) % 256;
	        }
	        writer([nextId].concat(_toConsumableArray(data)));
	        pendingInvocations[nextId] = { resolve: resolve, deserializer: deserializer };
	      });
	    },
	    stop: function stop() {
	      // unsubscribe to the reader (because we might be polling at 60fps)
	      subscription();
	    }
	  };
	}
	/* WEBPACK VAR INJECTION */}.call(exports, (function() { return this; }())))

/***/ }
/******/ ]);