#do not use me yet (and I'm not on npm yet anyway)

The PICO-8 GPIO pins allow us to communicate in 128-bit chunks.

The first 8 bits are reserved as a header, the remaining 120 are the message.

## Creating a connection

```javascript
let bridge = connect();

// this starts a polling loop which will eat up CPU cycles, so if you no longer need it, stop it:
bridge.stop();
```

## Executing an RPC

We create an RPC object as follows. These must be registered on both ends.

```javascript
let add = new RPC({
  id: 0, // a unique byte to identify the RPC
  input: [
    ArgTypes.Number,
    ArgTypes.Number
  ],
  output: [
    ArgTypes.Number
  ]
});
```

We can then create an *invocation* as follows:

```javascript
let addInvocation = add(2, 3);
```

And send it to the bridge:

```javascript
let response = bridge.send(addInvocation);
```

`response` is now a promise which will evaluate to the return value of the RPC.
