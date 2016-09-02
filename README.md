#do not use me yet (and I'm not on npm yet anyway)

###Defining Messages

Message types must be defined on both the JavaScript and PICO-8 sides of the communication.
At the moment things are only implemented such that JavaScript is always the
caller and PICO-8 is always the receiver, however the format allows for the
reverse, as well.
An example of an RPC that adds two bytes might look like this:

```javascript
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
```

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

Return values are always arrays, to easily support multiple return values (though I'm thinking of changing this and only allowing singular values, and making return values require using a tuple instead).

###Communicating From JavaScript

In JS-land we connect (start polling) and get an instance of the bridge:

```javascript
let bridge = connect();

// we can disconnect (and stop polling) by calling
// bridge.stop();
```

We then send an *invocation* of the message over the wire by using `bridge.send`, which returns a promise for the result:

```javascript
bridge.send(add(2, 3)).then(([sum]) => {
  console.log('2 + 3 =', sum);
});
```

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

#####Opaque/Opacify

An unspecified stream of bytes.
This is used when one end of the message shouldn't know anything about the format, for instance,
if a game presents this datatype for dumps of its state, the state format can
be changed without changing anything on the JavaScript end.

A type can be made to present as this type by using the `Opacify` constructor, so given a type `t`,
`Opacify(t)` wraps the value in such a way that it is parseable as an `Opaque`.


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

