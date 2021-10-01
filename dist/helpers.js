'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.readFile = undefined;

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _parseFloat = require('babel-runtime/core-js/number/parse-float');

var _parseFloat2 = _interopRequireDefault(_parseFloat);

exports.optimizeImage = optimizeImage;
exports.buildTestFunction = buildTestFunction;
exports.hashContent = hashContent;
exports.invokeIfFunction = invokeIfFunction;
exports.getFromCacheIfPossible = getFromCacheIfPossible;
exports.exists = exists;
exports.writeFile = writeFile;
exports.templatedFilePath = templatedFilePath;

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _minimatch = require('minimatch');

var _imagemin = require('imagemin');

var _imagemin2 = _interopRequireDefault(_imagemin);

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _util = require('util.promisify');

var _util2 = _interopRequireDefault(_util);

var _prettyBytes = require('pretty-bytes');

var _prettyBytes2 = _interopRequireDefault(_prettyBytes);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const readFile = exports.readFile = (0, _util2.default)(_fs2.default.readFile);
const writeFileAsync = (0, _util2.default)(_fs2.default.writeFile);
const mkdirpAsync = (0, _util2.default)(_mkdirp2.default);

/**
 * Optimizes a single image
 * returns the orignal if the "optimized" version is larger (only if the onlyUseIfSmaller option is true)
 * @param  {Object}  imageData
 * @param  {Object}  imageminOptions
 * @return {Promise(asset)}
 */
async function optimizeImage(imageData, fileName, { imageminOptions, onlyUseIfSmaller, sizeInfo }) {
  // Ensure that the contents i have are in the form of a buffer
  const imageBuffer = Buffer.isBuffer(imageData) ? imageData : Buffer.from(imageData, 'utf8');
  // And get the original size for comparison later to make sure it actually got smaller
  const originalSize = imageBuffer.length;

  // Await for imagemin to do the compression
  const optimizedImageBuffer = await _imagemin2.default.buffer(imageBuffer, imageminOptions);
  if (sizeInfo) {
    const optimizedSize = optimizedImageBuffer.length;
    const savedBytes = originalSize - optimizedSize;
    var savedPercentage = 0;
    if (originalSize > 0) {
      savedPercentage = savedBytes / originalSize * 100;
      console.log(`{imagemin} ${fileName} - original: ${(0, _prettyBytes2.default)(originalSize)} optimized: ${(0, _prettyBytes2.default)(optimizedSize)} saved: ${(0, _parseFloat2.default)(savedPercentage).toFixed(1)}%`);
    } else {
      console.log(`{imagemin} ${fileName} image already optimized`);
    }
  }

  // If onlyUseIfSmaller is true, and the optimization actually produced a LARGER file, then return the original version
  if (onlyUseIfSmaller && optimizedImageBuffer.length > originalSize) {
    return imageBuffer;
  } else {
    return optimizedImageBuffer;
  }
}

/**
 * Tests a filename to see if it matches any of the given test functions
 * This function is curried, pass in the first 3 params first, then the next 2
 * for each test needed
 * @param  {RegExp|RegExp[]|Function|Function[]|String|String[]} rawTestValue
 * @param  {Number} minFileSize
 * @param  {Number} maxFileSize
 * @return {Boolean}
 */
function buildTestFunction(rawTestValue, minFileSize, maxFileSize) {
  const testFunctions = compileRegex(rawTestValue);
  /**
   * @param  {String}      filename
   * @param  {assetSource} assetSource
   * @return {Boolean}
   */
  return (filename, assetSource) => {
    for (let func of testFunctions) {
      if (func(filename) === true) {
        return assetSource.length > minFileSize && assetSource.length <= maxFileSize;
      }
    }
    return false;
  };
}

/**
 * hashes file contents to make sure I can uniquely store a file even with absolute paths
 * @param  {string} content  File contents
 * @return {string}          A hash of the full file contents
 */
function hashContent(content) {
  return _crypto2.default.createHash('sha1').update(content).digest('hex');
}

/**
 * Invokes the passed in argument if it's a function
 * @param  {Function|Any}  func
 * @return {Any}
 */
function invokeIfFunction(func) {
  if (typeof func === 'function') {
    return func();
  } else {
    return func;
  }
}

/**
 * Gets the buffer of the file from cache. If it doesn't exist or the cache is
 * not enabled, it will invoke elseFunc and use it's result as the result of the
 * function, saving the result in the cache
 * @param  {String} cacheFolder
 * @param  {String} content
 * @param  {Function} elseFunc
 * @return {Buffer}
 */
async function getFromCacheIfPossible(cacheFolder, content, elseFunc) {
  let cacheFilePath;
  if (cacheFolder !== null) {
    cacheFilePath = _path2.default.resolve(cacheFolder, hashContent(content));
    if (await exists(cacheFilePath)) {
      return readFile(cacheFilePath);
    }
  }

  const fileBuffer = await elseFunc();
  if (cacheFolder !== null) {
    await writeFile(cacheFilePath, fileBuffer);
  }
  return fileBuffer;
}

/**
 * checks if a file/directory is accessable
 * @param {any} directory
 * @returns
 */
async function exists(directory) {
  return new _promise2.default((resolve, reject) => {
    _fs2.default.access(directory, _fs2.default.constants.R_OK | _fs2.default.constants.W_OK, err => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * async wrapper for writeFile that will create the directory if it does not already exist
 * @param {String} filename
 * @param {Buffer} buffer
 * @returns
 */
async function writeFile(filename, buffer) {
  const directory = _path2.default.dirname(filename);
  // if the directory doesn't exist, create it
  if (!(await exists(directory))) {
    await mkdirpAsync(directory);
  }

  return writeFileAsync(filename, buffer);
}

/**
 * Compiles a regex, glob, function, or an array of any of them to an array of functions
 * @param  {RegExp|RegExp[]|Function|Function[]|String|String[]} rawTestValue
 * @return {Function[]}
 */
function compileRegex(rawTestValue) {
  const tests = Array.isArray(rawTestValue) ? rawTestValue : [rawTestValue];

  return tests.map(test => {
    if (typeof test === 'function') {
      // if it's a function, just return this
      return test;
    } else if (test instanceof RegExp) {
      // If it's a regex return it wrapped in a function
      return filename => test.test(filename);
    } else if (typeof test === 'string') {
      // If it's a string, let minimatch convert it to a regex then wrap that in a function
      const regex = (0, _minimatch.makeRe)(test);
      return filename => regex.test(filename);
    } else {
      throw new Error('test parameter must be a regex, glob string, function, or an array of any of them');
    }
  });
}

/**
 * Replaces file name templates for a given path. Inspired by webpack's output.filename config.
 * @param {String|Function} fileName
 * @param {String} filePath
 * @returns {String}
 */
function templatedFilePath(fileName, filePath) {
  if (typeof fileName === 'function') {
    return fileName(filePath);
  }

  if (typeof fileName === 'string') {
    const originalFilePath = filePath;

    return fileName.replace('[path]', originalFilePath.split(_path2.default.basename(originalFilePath))[0]).replace('[name]', _path2.default.basename(originalFilePath, _path2.default.extname(originalFilePath))).replace('[ext]', _path2.default.extname(originalFilePath).split('.')[1]);
  }

  throw new Error('fileName parameter must be a string or a function');
}
//# sourceMappingURL=helpers.js.map