(function() {

// Converting the image into PICO-8 colours,
// we just use euclidean distance in RGB

var COLORS = [
  [0, 0, 0],
  [28, 42, 84],
  [127, 35, 83],
  [0, 136, 79],
  [173, 82, 49],
  [95, 87, 79],
  [194, 195, 199],
  [255, 241, 231],
  [255, 0, 72],
  [255, 164, 0],
  [255, 238, 0],
  [0, 230, 33],
  [25, 171, 255],
  [131, 117, 157],
  [255, 117, 168],
  [255, 204, 167]
];

function sqDist(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    let d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

function getClosestColor(color) {
  let bestDist = Infinity;
  let best = -1;
  COLORS.forEach((col, i) => {
    let dist = sqDist(col, color);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}


// Performing the communication
var connect = Communic8.connect;
var RPC = Communic8.RPC;
var ArgTypes = Communic8.ArgTypes;

var bridge = connect();
var sendImageRow = RPC({
  id: 0,
  input: [ ArgTypes.Array(ArgTypes.Byte), ArgTypes.Byte ],
  output: []
});


function pixelAt(data, x, y) {
  return getClosestColor([data[y*4*127+x*4],     data[y*4*127+x*4 + 1],     data[y*4*127+x*4 + 2]]);
}

var img = document.getElementById('img');
var canvas = document.getElementById('c');

img.onload = function(e) {
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  let data = ctx.getImageData(0, 0, 127, 127).data;
  for (let y = 0; y < 128; y++) {
    let row = [];
    for (let x = 0; x < 128; x+=2) {
      // each byte can store 2 pixels
      let a = pixelAt(data, x, y)
      let b = pixelAt(data, x + 1, y)
      row.push(a*16+b)
    }
    bridge.send(sendImageRow(row, y));
  }
}

document.body.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  var reader = new FileReader();
  reader.onload = function(e) {
    img.src = e.target.result;
  };
  reader.readAsDataURL(e.dataTransfer.files[0]);
});


document.body.addEventListener('dragover', (e) => {
  e.preventDefault();
});
})();
