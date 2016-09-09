## This is still alpha software and could have bugs or missing features, please use at your own risk
(that said, trying it out and reporting bugs and problems is much appreciated!)

#Communic8

Communic8 is a library to make it easy to send messages between JavaScript
running on a page and the PICO-8 webplayer.

The PICO-8 webplayer exposes a shared array to allow communication with the browser.
This library manages that shared array for you to make that communication simple.

If you're just coming at this from PICO-8 land, keep in mind you'll probably
want some familiarity with JS to make use of this.

##What can you do with it?

Lots of things! Anything you need PICO-8 to talk to an external program for,
this will help you with.

I originally made it so I could make a tool for making Tool Assisted Speedruns,
specifically for CELESTE, I wanted to be able to step through the game
frame-by-frame, forwards and backwards in order to get perfect play.

However, it's much more versatile than that.
Here are some ideas:

* Sending extra data into PICO-8 ([example](https://twitter.com/justinjaffray/status/771737798101594112))
* High score boards
* Bigger effects (change the background of the webpage in response to events in the game!)
* Tools for orchestrating the play of a game (such as my TAS tool)
* Online play (someone please make a pokemon ripoff with online trading)

and probably much more I haven't even thought of!

##Quick usage example

The general idea is that PICO-8 exposes messages that it can receive
(RPC/Remote Procedure Calls), which JavaScript can call into.

For this example, we'll just set up a little function inside PICO-8 that
returns the sum of two numbers.
We can make these functions do anything we want, but this is an easy example to
see stuff actually happening.

We define an RPC and start communic8 as follows:
```lua
functions = {}
-- define a function with id 0 that JavaScript can call into
functions[0] = {
  -- define what datatypes this function can take
  input={
    arg_types.byte,
    arg_types.byte
  },
  -- define what datatypes this function returns
  output={
    arg_types.byte
  },
  -- how the function is actually executed
  execute=function(args)
    return {args[1] + args[2]}
  end
}

update_communic8 = init_communic8(functions)
function _update()
  update_communic8()
end
```

In JavaScript, we need to define the same RPC so it knows how to talk to PICO-8.
We then start communic8 and send the message over, wait for the response, and then print it out.

```javascript
var add = RPC({
  id: 0, // a unique byte to identify the RPC
  input: [
    ArgTypes.Byte,
    ArgTypes.Byte
  ],
  output: [
    ArgTypes.Byte
  ]
});

var bridge = connect();
bridge.send(add(2, 3)).then((function(result) {
  console.log("2 + 3 =", result[0]); // => "2 + 3 = 5"
});
```

If you just want to jump into some working examples, look in the `examples/`
folder for some functional examples.

##Getting it

If you're npm-inclined, you know the drill:

```
npm install --save communic8
```

but if you'd rather just have a file you can include in a `<script>` tag, check
out the `dist/` folder in this repo for a compiled version.

##API

###Defining Messages

At the moment things are only implemented such that JavaScript is always the
caller and PICO-8 is always the receiver, however the format allows for the
reverse, as well.

In JavaScript we define the RPCs so we can create invocations to send to PICO-8:
```javascript
var add = RPC({
  id: 0, // a unique byte to identify the RPC
  input: [
    ArgTypes.Byte,
    ArgTypes.Byte
  ],
  output: [
    ArgTypes.Byte
  ]
});
```

On the PICO-8 end, this looks like this:
```lua
functions[0] = { -- add, has id 0
  input={
    arg_types.byte,
    arg_types.byte
  },
  output={
    arg_types.byte
  },
  execute=function(args)
    return {args[1] + args[2]}
  end
}
```

Note that since the computation is actually only happening on the PICO-8 side, that's the only side that has an implementation for the function.

Return values are always arrays, to easily support multiple return values (though I'm thinking of changing this and only allowing singular values, and making return values require using a tuple instead).

###Communicating From JavaScript

In JS-land we connect (start polling) and get an instance of the bridge:

```javascript
var bridge = connect();

// we can disconnect (and stop polling) by calling
// bridge.stop();
```

We can create an *invocation* of our RPC by calling it as a function:

```javascript
var addInvocation = add(2, 3);
```

We can send this invocation into PICO-8 land and get a result by using `bridge.send`:

```javascript
var result = bridge.send(addInvocation);
```

However, since PICO-8 has to run in order to produce the result, the value isn't going to be ready immediately.
Because of this, `bridge.send` actually returns a *promise* for the result.

We can operate on the result once it's ready by using the promise's `.then` method:

```javascript
result.then(function(response) {
  var sum = response[0]; // RPCs can return multiple values, so responses are always arrays
  console.log('2 + 3 =', sum); // => "2 + 3 = 5"
});
```

If you're not familiar with promises, see
[this](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Promise)
for more on them, or
[this](http://robotlolita.me/2015/11/15/how-do-promises-work.html) for a
*very* in-depth and *very* good read on them.

###Communicating from PICO-8

Include the stub in `index.p8` in your cart.
There are two values exposed, `arg_types` and `init_communic8`.

We have to tell communic8 how to handle the different messages we will receive from JavaScript, so we create a table indexed by the byte ids of the messages:

```lua
functions = {}
functions[0] = { -- add, has id 0
  input={
    arg_types.byte,
    arg_types.byte
  },
  output={
    arg_types.byte
  },
  execute=function(args)
    return {args[1] + args[2]}
  end
}
```

and then pass this table to `init_communic8`:
```lua
update_communic8 = init_communic8(functions)
```

and then call this in our `_update`:
```lua
function _update()
  update_communic8()
  ...
end
```

###Datatypes

In JS-land, datatypes are implemented as objects with a `serialize` and `deserialize` pair of functions.
```
const Byte = {
  serialize(n) {
    return [n];
  },
  // returns a pair of the deserialized value and the position to continue
  // deserializing from
  deserialize(data, at) {
    return [data[at], at + 1];
  }
};
```

`serialize` returns an array of bytes representing the value.
`deserialize` returns a pair of the value and the remaining bytes to be deserialized.

####Base Types

#####Boolean

A boolean value. Stored as 0 for false and 1 for true.

#####Byte

A single byte.

#####Number

A 32-bit fixed point PICO-8 number.
2 bytes at the beginning represent the whole part of the number and 2 bytes at the end represent the fractional part.

#####String

A string of characters.

#####Unspecified

An unspecified stream of bytes.
This is used when one end of the message shouldn't know anything about the format, for instance,
if a game presents this datatype for dumps of its state, the state format can
be changed without changing anything on the JavaScript end.

A type can be made to present as this type by using the `Unspecify` constructor, so given a type `t`,
`Unspecify(t)` wraps the value in such a way that it is parseable as an `Unspecified`.


####Compound Types

#####Array(<type>)

An array of the given type. For instance, `Array(Byte)` is an array of bytes,
`Array(Number)` is an array of numbers, etc.

#####Tuple(...<types>)

A tuple of the given types.
For instance, `Tuple(Byte, Boolean, Number)` would represent values like `[123, true, -45.24]`.

##Low-Level Protocol

###Requirements

The setup is this:
There's a 128-byte region of memory (`0x5f80` to `0x5fff`) within PICO-8 which
is mapped to a global JavaScript array, `pico8_gpio`.
Both PICO-8 and JavaScript can read and write to this section, and both can
poll reading it at 60fps.

The PICO-8 webplayer has a scheduler which allows it to get interrupted in the
middle of an `_update` loop sometimes. This means it's important that PICO-8
locks the pins when it is in the middle of writing to them.

###Solution used here

Note: I know nothing about networking/protocols

A message is:

* An arbitrary number of 0's, followed by
* a header byte with value 1 (when RPCs become bidirectional, this header will indicate who the caller is)
* Two bytes (a short) representing the number of bytes to come (this is not STRICTLY necessary, but simplifies implementation),
* an ID byte, so the response can be linked to the request, and finally
* the message itself

Remarks:

* The restriction that the length of a message must fit into a short is not as much of a problem as it sounds, messages that large would struggle to fit into PICO-8's available memory.
* The fact that we use a single byte for the ID means we can have at most 256 messages in flight at one time. Since (currently) messages are all resolved synchronously, I don't see this being a problem
* The arbitary number of 0's and the header byte are a necessary requirement since all messages come in 128-byte chunks. A short message must be padded to fit into the 128-byte space.
* Messages are quite compact, which is beneficial since we only have 128 bytes per frame
* Impossible to interpret a message without context/id/the type of RPC it is,
  so if something goes wrong it's very difficult to inspect the message to see its meaning

1 byte at the beginning of the 128-byte space is reserved as a header to indicate

* whether the PICO-8 end is currently in the process of writing to the pins
* who wrote the current value of the gpio pins
* whether the current value of the gpio pins has been consumed or not.

The writer sets both of these values upon writing, and then the consumer marks
the pins as consumed after consuming it.
There could be multiple messages in one filling of the GPIO pins, and there could be a message spread out over multiple.
The GPIO pins should be thought of more as a continuous stream of bytes.


##Credit

Thanks Sean LeBlanc for looking over the README and making some helpful suggestions.
