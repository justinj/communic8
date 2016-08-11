module.exports = {
  entry: "./controller.js",
  cache: true,
  output: {
    path: __dirname,
    filename: "build.js"
  },
  module: {
    loaders: [{
      test: /\.js$/,
      loader: 'babel-loader'
    }, {
      test: /\.json$/,
      loader: 'json-loader'
    }]
  }
};
