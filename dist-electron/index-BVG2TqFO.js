"use strict";
const main = require("./main-Ccp_obmx.js");
var once = { exports: {} };
var wrappy_1;
var hasRequiredWrappy;
function requireWrappy() {
  if (hasRequiredWrappy) return wrappy_1;
  hasRequiredWrappy = 1;
  wrappy_1 = wrappy;
  function wrappy(fn, cb) {
    if (fn && cb) return wrappy(fn)(cb);
    if (typeof fn !== "function")
      throw new TypeError("need wrapper function");
    Object.keys(fn).forEach(function(k) {
      wrapper[k] = fn[k];
    });
    return wrapper;
    function wrapper() {
      var args = new Array(arguments.length);
      for (var i = 0; i < args.length; i++) {
        args[i] = arguments[i];
      }
      var ret = fn.apply(this, args);
      var cb2 = args[args.length - 1];
      if (typeof ret === "function" && ret !== cb2) {
        Object.keys(cb2).forEach(function(k) {
          ret[k] = cb2[k];
        });
      }
      return ret;
    }
  }
  return wrappy_1;
}
var hasRequiredOnce;
function requireOnce() {
  if (hasRequiredOnce) return once.exports;
  hasRequiredOnce = 1;
  var wrappy = requireWrappy();
  once.exports = wrappy(once$1);
  once.exports.strict = wrappy(onceStrict);
  once$1.proto = once$1(function() {
    Object.defineProperty(Function.prototype, "once", {
      value: function() {
        return once$1(this);
      },
      configurable: true
    });
    Object.defineProperty(Function.prototype, "onceStrict", {
      value: function() {
        return onceStrict(this);
      },
      configurable: true
    });
  });
  function once$1(fn) {
    var f = function() {
      if (f.called) return f.value;
      f.called = true;
      return f.value = fn.apply(this, arguments);
    };
    f.called = false;
    return f;
  }
  function onceStrict(fn) {
    var f = function() {
      if (f.called)
        throw new Error(f.onceError);
      f.called = true;
      return f.value = fn.apply(this, arguments);
    };
    var name = fn.name || "Function wrapped with `once`";
    f.onceError = name + " shouldn't be called more than once";
    f.called = false;
    return f;
  }
  return once.exports;
}
var endOfStream;
var hasRequiredEndOfStream;
function requireEndOfStream() {
  if (hasRequiredEndOfStream) return endOfStream;
  hasRequiredEndOfStream = 1;
  var once2 = requireOnce();
  var noop = function() {
  };
  var qnt = main.commonjsGlobal.Bare ? queueMicrotask : process.nextTick.bind(process);
  var isRequest = function(stream) {
    return stream.setHeader && typeof stream.abort === "function";
  };
  var isChildProcess = function(stream) {
    return stream.stdio && Array.isArray(stream.stdio) && stream.stdio.length === 3;
  };
  var eos = function(stream, opts, callback) {
    if (typeof opts === "function") return eos(stream, null, opts);
    if (!opts) opts = {};
    callback = once2(callback || noop);
    var ws = stream._writableState;
    var rs = stream._readableState;
    var readable = opts.readable || opts.readable !== false && stream.readable;
    var writable = opts.writable || opts.writable !== false && stream.writable;
    var cancelled = false;
    var onlegacyfinish = function() {
      if (!stream.writable) onfinish();
    };
    var onfinish = function() {
      writable = false;
      if (!readable) callback.call(stream);
    };
    var onend = function() {
      readable = false;
      if (!writable) callback.call(stream);
    };
    var onexit = function(exitCode) {
      callback.call(stream, exitCode ? new Error("exited with error code: " + exitCode) : null);
    };
    var onerror = function(err) {
      callback.call(stream, err);
    };
    var onclose = function() {
      qnt(onclosenexttick);
    };
    var onclosenexttick = function() {
      if (cancelled) return;
      if (readable && !(rs && (rs.ended && !rs.destroyed))) return callback.call(stream, new Error("premature close"));
      if (writable && !(ws && (ws.ended && !ws.destroyed))) return callback.call(stream, new Error("premature close"));
    };
    var onrequest = function() {
      stream.req.on("finish", onfinish);
    };
    if (isRequest(stream)) {
      stream.on("complete", onfinish);
      stream.on("abort", onclose);
      if (stream.req) onrequest();
      else stream.on("request", onrequest);
    } else if (writable && !ws) {
      stream.on("end", onlegacyfinish);
      stream.on("close", onlegacyfinish);
    }
    if (isChildProcess(stream)) stream.on("exit", onexit);
    stream.on("end", onend);
    stream.on("finish", onfinish);
    if (opts.error !== false) stream.on("error", onerror);
    stream.on("close", onclose);
    return function() {
      cancelled = true;
      stream.removeListener("complete", onfinish);
      stream.removeListener("abort", onclose);
      stream.removeListener("request", onrequest);
      if (stream.req) stream.req.removeListener("finish", onfinish);
      stream.removeListener("end", onlegacyfinish);
      stream.removeListener("close", onlegacyfinish);
      stream.removeListener("finish", onfinish);
      stream.removeListener("exit", onexit);
      stream.removeListener("end", onend);
      stream.removeListener("error", onerror);
      stream.removeListener("close", onclose);
    };
  };
  endOfStream = eos;
  return endOfStream;
}
var pump_1;
var hasRequiredPump;
function requirePump() {
  if (hasRequiredPump) return pump_1;
  hasRequiredPump = 1;
  var once2 = requireOnce();
  var eos = requireEndOfStream();
  var fs;
  try {
    fs = require("fs");
  } catch (e) {
  }
  var noop = function() {
  };
  var ancient = typeof process === "undefined" ? false : /^v?\.0/.test(process.version);
  var isFn = function(fn) {
    return typeof fn === "function";
  };
  var isFS = function(stream) {
    if (!ancient) return false;
    if (!fs) return false;
    return (stream instanceof (fs.ReadStream || noop) || stream instanceof (fs.WriteStream || noop)) && isFn(stream.close);
  };
  var isRequest = function(stream) {
    return stream.setHeader && isFn(stream.abort);
  };
  var destroyer = function(stream, reading, writing, callback) {
    callback = once2(callback);
    var closed = false;
    stream.on("close", function() {
      closed = true;
    });
    eos(stream, { readable: reading, writable: writing }, function(err) {
      if (err) return callback(err);
      closed = true;
      callback();
    });
    var destroyed = false;
    return function(err) {
      if (closed) return;
      if (destroyed) return;
      destroyed = true;
      if (isFS(stream)) return stream.close(noop);
      if (isRequest(stream)) return stream.abort();
      if (isFn(stream.destroy)) return stream.destroy();
      callback(err || new Error("stream was destroyed"));
    };
  };
  var call = function(fn) {
    fn();
  };
  var pipe = function(from, to) {
    return from.pipe(to);
  };
  var pump = function() {
    var streams = Array.prototype.slice.call(arguments);
    var callback = isFn(streams[streams.length - 1] || noop) && streams.pop() || noop;
    if (Array.isArray(streams[0])) streams = streams[0];
    if (streams.length < 2) throw new Error("pump requires two streams per minimum");
    var error;
    var destroys = streams.map(function(stream, i) {
      var reading = i < streams.length - 1;
      var writing = i > 0;
      return destroyer(stream, reading, writing, function(err) {
        if (!error) error = err;
        if (err) destroys.forEach(call);
        if (reading) return;
        destroys.forEach(call);
        callback(error);
      });
    });
    return streams.reduce(pipe);
  };
  pump_1 = pump;
  return pump_1;
}
exports.requirePump = requirePump;
