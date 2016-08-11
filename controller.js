import { RPC, ArgTypes, connect } from './index';

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

let sum = RPC({
  id: 1, // a unique byte to identify the RPC
  args: [
    ArgTypes.Array(ArgTypes.Byte)
  ],
  ret: [
    ArgTypes.Byte
  ]
});


let bridge = connect();

bridge.send(sum([1,2,3,4,5])).then(result => {
  console.log('got 1+2+3+4+5 = ', result);
});

// bridge.send(add(2, 3)).then(result => {
//   console.log('got 2 + 3 to be ', result);
// });
// bridge.send(add(5, 3)).then(result => {
//   console.log('got 5 + 3 to be ', result);
// });
