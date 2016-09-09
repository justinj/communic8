(function() {
// Performing the communication
var connect = Communic8.connect;
var RPC = Communic8.RPC;
var ArgTypes = Communic8.ArgTypes;

var bridge = connect();

var setText = RPC({
  id: 0,
  input: [ ArgTypes.String ],
  output: []
});

var input = document.getElementById('textinput');

input.addEventListener('input', function(e) {
  bridge.send(setText(e.target.value));
});
})();
