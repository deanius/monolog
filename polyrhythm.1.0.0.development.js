import {
  Observable,
  Subscription,
  Subject,
  concat,
  of,
  from,
  never,
  timer
} from "https://dev.jspm.io/rxjs@6/_esm2015";
export { Subscription } from "https://dev.jspm.io/rxjs@6/_esm2015";
import {
  filter as filter$1,
  tap,
  takeUntil,
  switchMap,
  concatMap,
  mergeMap,
  exhaustMap,
  map
} from "https://dev.jspm.io/rxjs@6/_esm2015/operators";

function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;

  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0) continue;
    target[key] = source[key];
  }

  return target;
}

function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(n);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
    return _arrayLikeToArray(o, minLen);
}

function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;

  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

  return arr2;
}

function _createForOfIteratorHelperLoose(o) {
  var i = 0;

  if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) {
    if (Array.isArray(o) || (o = _unsupportedIterableToArray(o)))
      return function() {
        if (i >= o.length)
          return {
            done: true
          };
        return {
          done: false,
          value: o[i++]
        };
      };
    throw new TypeError(
      "Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
    );
  }

  i = o[Symbol.iterator]();
  return i.next.bind(i);
}

// @ts-nocheck
// wrt to a returned Observable - one will be canceled if its running,
// one will only be started if it wasn't running!
//prettier-ignore

var toggleMap = function toggleMap(spawner, mapper) {
  if (mapper === void 0) {
    mapper = function mapper(_, inner) {
      return inner;
    };
  }

  return function (source) {
    return new Observable(function (observer) {
      var innerSub;
      return source.subscribe({
        next: function next(outer) {
          if (!innerSub || innerSub.closed) {
            innerSub = spawner(outer).subscribe(function (inner) {
              return observer.next(mapper(outer, inner));
            }, function (e) {
              return observer.error(e);
            });
          } else {
            innerSub.unsubscribe();
          }
        },
        error: function error(e) {
          observer.error(e);
        },
        complete: function complete() {
          observer.complete();
        }
      });
    });
  };
};

/**
 * When a listener is async, returning an Observable, it's possible
 * that a previous Observable of that listener is running already.
 * Concurrency modes control how the new and old listener are affected
 * when when they overlap.
 *
 * ![concurrency modes](https://s3.amazonaws.com/www.deanius.com/ConcurModes2.png)
 */

var ConcurrencyMode;

(function(ConcurrencyMode) {
  /**
   * Newly returned Observables are subscribed immediately, without regard to resource constraints, or the ordering of their completion. (ala mergeMap) */
  ConcurrencyMode["parallel"] = "parallel";
  /**
   * Observables are enqueued and always complete in the order they were triggered. (ala concatMap)*/

  ConcurrencyMode["serial"] = "serial";
  /**
   * Any existing Observable is canceled, and a new is begun (ala switchMap) */

  ConcurrencyMode["replace"] = "replace";
  /**
   * Any new Observable is not subscribed if another is running. (ala exhaustMap) */

  ConcurrencyMode["ignore"] = "ignore";
  /**
   * Any new Observable is not subscribed if another is running, and
   * the previous one is canceled. (ala switchMap with empty()) */

  ConcurrencyMode["toggle"] = "toggle";
})(ConcurrencyMode || (ConcurrencyMode = {}));

var Channel = /*#__PURE__*/ (function() {
  function Channel() {
    this.channel = new Subject();
    this.filters = new Map();
    this.listeners = new Map();
    this.listenerEnders = new Map();
    this.listenerParts = new Map();
  }

  var _proto = Channel.prototype;

  _proto.trigger = function trigger(type, payload) {
    var event = {
      type: type
    };
    payload &&
      Object.assign(event, {
        payload: payload
      });

    for (
      var _iterator = _createForOfIteratorHelperLoose(this.filters.entries()),
        _step;
      !(_step = _iterator()).done;

    ) {
      var _step$value = _step.value,
        predicate = _step$value[0],
        _filter2 = _step$value[1];
      predicate(event) && _filter2(event);
    }

    Object.freeze(event);
    this.channel.next(event);

    for (
      var _iterator2 = _createForOfIteratorHelperLoose(
          this.listeners.entries()
        ),
        _step2;
      !(_step2 = _iterator2()).done;

    ) {
      var _step2$value = _step2.value,
        _predicate = _step2$value[0],
        listener = _step2$value[1];

      if (_predicate(event)) {
        listener(event);
      }
    }

    return event;
  };

  _proto.query = function query(eventMatcher) {
    return this.channel
      .asObservable()
      .pipe(filter$1(getEventPredicate(eventMatcher)));
  };

  _proto.filter = function filter(eventMatcher, f) {
    var _this = this;

    var predicate = getEventPredicate(eventMatcher);
    this.filters.set(predicate, f);
    return new Subscription(function() {
      _this.filters["delete"](predicate);
    });
  };

  _proto.listen = function listen(eventMatcher, listener, config) {
    var _this2 = this;

    if (config === void 0) {
      config = {};
    }

    var predicate = getEventPredicate(eventMatcher);
    var userTriggers = getUserTriggers(config.trigger);
    var ender = new Subject();
    var parts = new Subject();
    this.listenerEnders.set(predicate, ender);
    this.listenerParts.set(predicate, parts);
    var canceler = new Subscription(function() {
      _this2.deactivateListener(predicate);
    });

    var enqueuePart = function enqueuePart(event) {
      try {
        var userReturned = toObservable(listener(event));
        var part = concat(userReturned, applyCompleteTrigger());
        parts.next(part);
      } catch (e) {
        canceler.unsubscribe();
      }
    };

    var applyNextTrigger = function applyNextTrigger(e) {
      userTriggers.next && _this2.trigger(userTriggers.next, e);
    };

    var applyCompleteTrigger = function applyCompleteTrigger() {
      return new Observable(function(notify) {
        userTriggers.complete && _this2.trigger(userTriggers.complete);
        notify.complete();
      });
    };

    var applyOverlap = operatorForMode(config.mode);
    var listenerEvents = parts.pipe(
      applyOverlap(function(part) {
        return part;
      }),
      tap(applyNextTrigger),
      takeUntil(ender)
    );
    var listenerObserver = {
      error: function error(err) {
        canceler.unsubscribe();

        if (userTriggers.error) {
          _this2.trigger(userTriggers.error, err);
        }
      }
    };
    var listenerSub = listenerEvents.subscribe(listenerObserver);
    canceler.add(function() {
      return listenerSub.unsubscribe();
    });
    this.listeners.set(predicate, enqueuePart);
    return canceler;
  };

  _proto.on = function on(eventMatcher, listener, config) {
    if (config === void 0) {
      config = {};
    }

    return listen(eventMatcher, listener, config);
  };

  _proto.reset = function reset() {
    this.filters.clear();

    for (
      var _iterator3 = _createForOfIteratorHelperLoose(this.listeners.keys()),
        _step3;
      !(_step3 = _iterator3()).done;

    ) {
      var listenerPredicate = _step3.value;
      this.deactivateListener(listenerPredicate);
    }
  };

  _proto.deactivateListener = function deactivateListener(predicate) {
    // unregister from future effects
    this.listeners["delete"](predicate); // cancel any in-flight

    var ender = this.listenerEnders.get(predicate);
    ender && ender.next();
    this.listenerEnders["delete"](predicate);
  };

  return Channel;
})(); // Exports for a default Channel

var channel = /*#__PURE__*/ new Channel();
var trigger = /*#__PURE__*/ channel.trigger.bind(channel);
var query = /*#__PURE__*/ channel.query.bind(channel);
var filter = /*#__PURE__*/ channel.filter.bind(channel);
var listen = /*#__PURE__*/ channel.listen.bind(channel);
var on = /*#__PURE__*/ channel.on.bind(channel);
var reset = /*#__PURE__*/ channel.reset.bind(channel);

function getEventPredicate(eventMatcher) {
  var predicate;

  if (eventMatcher instanceof RegExp) {
    predicate = function predicate(event) {
      return eventMatcher.test(event.type);
    };
  } else if (eventMatcher instanceof Function) {
    predicate = eventMatcher;
  } else if (typeof eventMatcher === "boolean") {
    predicate = function predicate() {
      return eventMatcher;
    };
  } else if (eventMatcher.constructor === Array) {
    predicate = function predicate(event) {
      return eventMatcher.includes(event.type);
    };
  } else {
    predicate = function predicate(event) {
      return eventMatcher === event.type;
    };
  }

  return predicate;
}

function getUserTriggers(config) {
  if (config === void 0) {
    config = {};
  }

  return config;
}
/** Controls what types can be returned from an `on` handler:
    Primitive types: `of()`
    Promises: `from()`
    Observables: pass-through
*/

function toObservable(_results) {
  if (typeof _results === "undefined") return of(undefined); // An Observable is preferred

  if (_results.subscribe) return _results; // A Promise is acceptable

  if (_results.then) return from(_results); // otherwiser we convert it to a single-item Observable

  return of(_results);
}

function operatorForMode(mode) {
  if (mode === void 0) {
    mode = ConcurrencyMode.parallel;
  }

  switch (mode) {
    case ConcurrencyMode.ignore:
      return exhaustMap;

    case ConcurrencyMode.parallel:
      return mergeMap;

    case ConcurrencyMode.serial:
      return concatMap;

    case ConcurrencyMode.toggle:
      return toggleMap;

    case ConcurrencyMode.replace:
    default:
      return switchMap;
  }
}

/**
 * Returns a random hex string, like a Git SHA. Not guaranteed to
 * be unique - just to within about 1 in 10,000.
 */

var randomId = function randomId(length) {
  if (length === void 0) {
    length = 7;
  }

  return Math.floor(Math.pow(2, length * 4) * Math.random())
    .toString(16)
    .padStart(length, "0");
};
/**
 * Returns an Observable of the value, or result of the function call, after
 * the number of milliseconds given. After is lazy and cancelable! So nothing happens until .subscribe
 * is called explicitly (via subscribe) or implicitly (toPromise(), await).
 * For a delay of 0, the function is executed synchronously when .subscribe is called.
 * @returns An Observable of the object or thunk return value. It is 'thenable', so may also be awaited directly.
 * @example after(100, () => new Date().getTime()).subscribe(msec => ...)
 */

var after = function after(ms, objOrFn, label) {
  var valueProducer =
    typeof objOrFn === "function"
      ? function() {
          return objOrFn(label);
        }
      : function() {
          return objOrFn;
        };
  var delay = ms <= 0 ? of(0) : ms === Infinity ? never() : timer(ms);
  var resultObs = delay.pipe(map(valueProducer)); // after is a 'thenable, thus usable with await.
  // ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await
  // @ts-ignore

  resultObs.then = function(resolve, reject) {
    return resultObs.toPromise().then(resolve, reject);
  }; // @ts-ignore

  return resultObs;
};

export {
  Channel,
  ConcurrencyMode,
  after,
  channel,
  filter,
  listen,
  on,
  query,
  randomId,
  reset,
  trigger
};
//# sourceMappingURL=polyrhythm.esm.js.map
