import { RPC, ArgTypes, connect } from './index';

let loadCelesteLevel = RPC({
  id: 0,
  args: [
    ArgTypes.Byte
  ],
  ret: []
});

let bridge = connect();

bridge.send(loadCelesteLevel(14)).then(result => {
  console.log('it loaded', result);
});
