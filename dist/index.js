'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _os = require('os');

var _lodash = require('lodash.map');

var _lodash2 = _interopRequireDefault(_lodash);

var _imageminSvgo = require('imagemin-svgo');

var _imageminSvgo2 = _interopRequireDefault(_imageminSvgo);

var _asyncThrottle = require('async-throttle');

var _asyncThrottle2 = _interopRequireDefault(_asyncThrottle);

var _imageminOptipng = require('imagemin-optipng');

var _imageminOptipng2 = _interopRequireDefault(_imageminOptipng);

var _imageminPngquant = require('imagemin-pngquant');

var _imageminPngquant2 = _interopRequireDefault(_imageminPngquant);

var _imageminGifsicle = require('imagemin-gifsicle');

var _imageminGifsicle2 = _interopRequireDefault(_imageminGifsicle);

var _imageminJpegtran = require('imagemin-jpegtran');

var _imageminJpegtran2 = _interopRequireDefault(_imageminJpegtran);

var _RawSource = require('webpack-sources/lib/RawSource');

var _RawSource2 = _interopRequireDefault(_RawSource);

var _helpers = require('./helpers.js');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ImageminPlugin {
  constructor(options = {}) {
    const {
      disable = false,
      test = /.*/,
      minFileSize = 0,
      maxFileSize = Infinity,
      maxConcurrency = (0, _os.cpus)().length,
      plugins = [],
      optipng = {
        optimizationLevel: 3
      },
      gifsicle = {
        optimizationLevel: 1
      },
      jpegtran = {
        progressive: false
      },
      svgo = {},
      pngquant = null,
      externalImages = {},
      cacheFolder = null,
      sizeInfo = false,
      onlyUseIfSmaller = false
    } = options;

    this.options = {
      disable,
      maxConcurrency,
      imageminOptions: {
        plugins: []
      },
      testFunction: (0, _helpers.buildTestFunction)(test, minFileSize, maxFileSize),
      externalImages: (0, _extends3.default)({
        context: '.',
        sources: [],
        destination: '.',
        fileName: null
      }, externalImages),
      cacheFolder,
      sizeInfo,
      onlyUseIfSmaller

      // As long as the options aren't `null` then include the plugin. Let the destructuring above
      // control whether the plugin is included by default or not.
    };for (let [plugin, pluginOptions] of [[_imageminOptipng2.default, optipng], [_imageminGifsicle2.default, gifsicle], [_imageminJpegtran2.default, jpegtran], [_imageminSvgo2.default, svgo], [_imageminPngquant2.default, pngquant]]) {
      if (pluginOptions !== null) {
        this.options.imageminOptions.plugins.push(plugin(pluginOptions));
      }
    }

    // And finally, add any plugins that they pass in the options to the internal plugins array
    this.options.imageminOptions.plugins.push(...plugins);
  }

  apply(compiler) {
    // Add the compiler options to my options
    this.options.compilerOptions = compiler.options;

    // If disabled, short-circuit here and just return
    if (this.options.disable === true) return null;

    // Access the assets once they have been assembled
    const onEmit = async (compilation, callback) => {
      // Create a throttle object which will limit the number of concurrent processes running
      const throttle = (0, _asyncThrottle2.default)(this.options.maxConcurrency);

      const start = new Date().getTime();
      console.log("Start optimize");
      try {
        // Optimise all images at the same time (throttled to maxConcurrency)
        // and await until all of them to complete
        await _promise2.default.all([...this.optimizeWebpackImages(throttle, compilation), ...this.optimizeExternalImages(throttle)]);

        // At this point everything is done, so call the callback without anything in it
        callback();
      } catch (err) {
        // if at any point we hit a snag, pass the error on to webpack
        callback(err);
      }
      const end = new Date().getTime();
      const time = end - start;
      console.log('Summary Optimize time: ' + time + 'ms');
    };

    // Check if the webpack 4 plugin API is available
    if (compiler.hooks) {
      // Register emit event listener for webpack 4
      compiler.hooks.emit.tapAsync(this.constructor.name, onEmit);
    } else {
      // Register emit event listener for older webpack versions
      compiler.plugin('emit', onEmit);
    }
  }

  /**
   * Optimize images from webpack and put them back in the asset array when done
   * @param  {Function} throttle       The setup throttle library
   * @param  {Object} compilation      The compilation from webpack-sources
   * @return {Promise[]}               An array of promises that resolve when each image is done being optimized
   */
  optimizeWebpackImages(throttle, compilation) {
    const {
      testFunction,
      cacheFolder
    } = this.options;

    // Return an array of promises that resolve when each file is done being optimized
    // pass everything through the throttle function to limit maximum concurrency
    return (0, _lodash2.default)(compilation.assets, (asset, filename) => throttle(async () => {
      const assetSource = asset.source();
      // Skip the image if it's not a match for the regex or it's too big/small
      if (testFunction(filename, assetSource)) {
        // Use the helper function to get the file from cache if possible, or
        // run the optimize function and store it in the cache when done
        // console.log('[filename]=>', filename);
        let optimizedImageBuffer = await (0, _helpers.getFromCacheIfPossible)(cacheFolder, assetSource, () => {
          return (0, _helpers.optimizeImage)(assetSource, _path2.default.basename(filename), this.options);
        });

        // Then write the optimized version back to the asset object as a "raw source"
        compilation.assets[filename] = new _RawSource2.default(optimizedImageBuffer);
      }
    }));
  }

  /**
   * Optimizes external images
   * @param  {Function} throttle The setup throttle library
   * @return {Promise[]}         An array of promises that resolve when each image is done being optimized
   */
  optimizeExternalImages(throttle) {
    const {
      compilerOptions,
      externalImages: {
        context,
        sources,
        destination,
        fileName
      },
      testFunction,
      cacheFolder
    } = this.options;

    const fullContext = _path2.default.resolve(compilerOptions.context, context);

    const invokedDestination = _path2.default.resolve((0, _helpers.invokeIfFunction)(destination));

    return (0, _lodash2.default)((0, _helpers.invokeIfFunction)(sources), filename => throttle(async () => {
      let relativeFilePath = _path2.default.relative(fullContext, filename);
      const fileData = await (0, _helpers.readFile)(_path2.default.resolve(fullContext, relativeFilePath));
      if (testFunction(filename, fileData)) {
        // Use the helper function to get the file from cache if possible, or
        // run the optimize function and store it in the cache when done
        let optimizedImageBuffer = await (0, _helpers.getFromCacheIfPossible)(cacheFolder, fileData, async () => {
          return (0, _helpers.optimizeImage)(fileData, _path2.default.basename(filename), this.options);
        });

        if (fileName) {
          relativeFilePath = (0, _helpers.templatedFilePath)(fileName, relativeFilePath);
        }

        const writeFilePath = _path2.default.join(invokedDestination, relativeFilePath);

        // Write the file to the destination when done
        return (0, _helpers.writeFile)(writeFilePath, optimizedImageBuffer);
      }
    }));
  }
}
exports.default = ImageminPlugin;
//# sourceMappingURL=index.js.map