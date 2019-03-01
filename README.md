# The Monolog App, Implemented in Rx-Helper

Quick Links: [Live App](http://www.deanius.com/monolog.html) | [Monolog Repo](https://github.com/deanius/monolog) | [Rx Helper Repo](https://github.com/deanius/rx-helper) | [Original Monolog App](https://github.com/kimjoar/writings/blob/master/published/understanding-backbone.md)

To help you understand how Rx-Helper helps you write apps with:

- Decoupled code
- Error isolation
- Simple-to-make and maintain non-blocking async code

an app called Monolog, which [here](https://github.com/kimjoar/writings/blob/master/published/understanding-backbone.md) was implemented both in JQuery and Backbone, was built in the Rx-Helper style.

This means in the new style, the app:

1. Communicates what is to happen via events (aka Actions)- plain-old JS objects with type(String) and payload(any) fields (see Flux Standard Action).
1. Abstracts sources of events behind Observables.
1. Specifies consequences inside error-isolated handlers which respond to a subset of events.
1. Returns Observables from event handlers, so that the execution of those handlers can be queued, or otherwise fine-tuned as needs change.

Let's elaborate on each of these points:

**1)** The point about working via Actions can be understood as the Redux pattern. But instead of a `store` receiving actions via `dispatch`, an `agent` receives actions via `process`. The primary difference to the caller is in how Rx-Helper structures its return value, which will be detailed further later.

**2)** The point about using Observables instead of events is that an Observable is a single object which can provide values over time. As such it is a perfect data type to model:

- A user's mouse movements
- A server's return value
- A websocket's events
- Events a DOM can raise

Having an explicit reference to "all events over time that are keyups on the #monolog element" allows us to return this reference from a function, much like returning a Promise for a single future event. This way our application can be split into a WHAT and a HOW, where the Observable is a stream of WHAT, upon which you'll attach consequences in the HOW section.

**3)** In regular DOM event handling, an error in one handler can prevent other handlers from firing. This risk of data loss is the consequence of the way the DOM calls them in a loop, synchronously, without any error handling. The Rx-Helper Agent instead treats each handler like a separate job box processing a message off of a queue - one job box is not affected directly by another's failure. This is generally more robust.

**4)** In regular DOM event handling, if events are produced too rapidly, multiple event handlers may be running for the same event type simultaneously. When resources, or ordering semantics are important, it may be better to queue up handling, terminate previous or long-running ones, or block new handlers from firing until a previous has completed. In Rx-Heler, each handler can be parameterized by a different strategy— parallel, serial, cutoff, or block— without rewriting the code, and whether the work to be done is synchronous or async!

Now, let's check out how this plays out in the actual Monolog application.

# The App

The monolog app is a TODO list style app with the following specifications:

1. An input, a list, and a submit button are present.
1. A user may type text into the input.
1. A user may click submit.
1. Upon submit, the text from the input should go into a list.
1. Upon submit, the text from the input should be cleared.
1. Upon submit, the text should be sent to an AJAX endpoint.

# The Code

The commits required to build this are laid out below with commentary.

First we'll talk about encapsulating the DOM.

Second, we'll build an App that controls it out of an `rx-helper` `agent` we'll call App.

Lastly, we'll tune the app's concurrency and show how the app can grow in functionality safely with minimal fear of new features breaking old ones.

# The DOM

## 1.0 The UI

Introducing the UI:

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="new-status">
      <h2>New line</h2>
      <form action="">
        <input
          type="text"
          id="monolog"
          placeholder="Ex: To be, or not to be..."
        /><br />
        <input type="submit" value="Post" />
      </form>
    </div>

    <div>
      <h2>Monolog Lines</h2>
      <ul id="lines"></ul>
    </div>
  </body>
</html>
```

## 1.1 Define DOM mutation functions

In order to be able implement requirements 4 & 5, we'll need to write to the DOM.

Now's a good time to group all the things we care about the DOM - the elements we listen to events from or change, the changes we want to do - into a single object.

```diff
     </div>
+    <script>
+      /* Interesting DOM Events: #monolog keyup, form submit */
+      /* Exposed DOM mutation methods: clear, addToList */
+      const DOM = {
+        monolog: document.getElementById("monolog"),
+        lines: document.getElementById("lines"),
+        form: document.getElementById("form"),
+        clear() {
+          this.monolog.value = "";
+        },
+        addToLines(line) {
+          this.lines.innerHTML = this.lines.innerHTML +
+            `
+              <li>${line}</li>
+            `;
+        }
+      };
+
+      window.DOM = DOM;
+    </script>
   </body>
```

We can try these out by calling `DOM.clear()` in the console for example.

![](http://www.deanius.com/Monolog-1.1.gif)

## 1.2 Expose Event Streams

```diff
     <script>
+      var { fromEvent } = rxjs;
+
       /* Interesting DOM Events: #monolog keyup, form submit */
       /* Exposed DOM mutation methods: clear, addToList */
       const DOM = {

+        }
+        changes() {
+          return fromEvent(this.monolog, "keyup")
+        },
+        submits() {
+          return fromEvent(this.form, "submit")
         }
       };
     </script>
```

In the old way of doing things, you'd call `elem.addEventListener(h, 'click')` with some handler function `h`.

But what we want is: Just like a Promise gives you a stand-in for a single future value, we want an object that is a stand-in for every future event to come from an element. We don't want to attach any event-handling functionality now! We just want our `DOM` object to be able to return an object that represents all future events from it. This is what RxJS `fromEvent` does - it returns an Observable for those events.

![](http://www.deanius.com/Monolog-1.2.gif)

We will build upon Observables of events later, adding consequences (side-effects), and transforming the events they carry through a pipeline of pure functions. For now, lets just expose them as gettable properties of our `DOM` abstraction.

## 1.3 The Change Stream Contains the Current Value

While the `fromEvent` function produces an Observable of DOM events, what's more useful to us is to have a stream of change events containing only the new value, not just the letter that caused the change.

Just like UNIX processes let you pipe a command's output through another, Observables come with their own pipe. And into our `changes()` pipe, we add a `map` operator. `map` takes a function which returns a replacement value for the event. In this case we can reach right into the input element's value via the `target` property of the event.

Once we've added `map` to our `pipe`, the DOM.changes() Observable will contain the current value.

```diff
+      var { map } = rxjs.operators;

       /* Interesting DOM Events: #monolog keyup, form submit */
       /* Exposed DOM mutation methods: clear, addToList */
@@ -52,7 +53,9 @@ <h2>Monolog Lines</h2>
             `;
         },
         changes() {
-          return fromEvent(this.monolog, "keyup")
+          return fromEvent(this.monolog, "keyup").pipe(
+            map(e => e.target.value)
+          )
```

Note how this has altered the output of the DOM.changes() stream:

```
DOM.changes().subscribe(e => console.log("Got a change", e))
```

![](http://www.deanius.com/Monolog-1.3.gif)

## 1.4 The Submit Stream Prevents Form Submission

We can't subscribe to `DOM.submits()` as readily as `DOM.changes()`, since the default behavior of a form submit event is to reload the page. We want to make canceling this default behavior part of the stream - we would like `DOM.submits()` to mean _submit events whose default event has already been prevented_.

While we used the `map` operator to call a function that *replace*d an Observable's item with another, we can use the `tap` operator to perform a side-effect aka consequence _without_ changing the Observable item's value.

```diff
-      var { map } = rxjs.operators;
+      var { map, tap } = rxjs.operators;

       /* Interesting DOM Events: #monolog keyup, form submit */
       /* Exposed DOM mutation methods: clear, addToList */
@@ -58,7 +58,9 @@ <h2>Monolog Lines</h2>
           )
         },
         submits() {
-          return fromEvent(this.form, "submit")
+          return fromEvent(this.form, "submit").pipe(
+            tap(e => e.preventDefault())
+          )
```

But when we hit the button, the page still reloads.

This shows that Observables by themselves must be `subscribed` to in order for the functions in their `pipe` to run, as they do not start producing values (aka notifying), or doing work - until the time you subscribe.

We could put a call to `DOM.submits().subscribe()` in our app, but instead we'll begin using Rx-Helper. Rx-Helper brings benefits of subscription management, error isolation, and more. We'll use an instance of `agent` from `rx-helper`, to structure the rest of our app.

# The App

## 2.1 Subscribe to DOM events, and pass them through a filter

```js
const App = AntaresProtocol.agent;

App.addFilter(({ action }) => {
  console.log(action.type, action.payload);
});

App.subscribe(DOM.submits(), { type: "DOM/submit" });
App.subscribe(DOM.changes(), { type: "DOM/change" });
```

We notice that with `App.subscribe(DOM.submits())`, our form submits do not reload the page anymore. To give the events a name, we supply the argument with `{ type: 'DOM/submit' }`, that will provide the agent with the submit DOM event in the payload of an action of type `DOM/submit`.

We also see how the agent named `App` can have filters: synchronous functions which run upon every event (or some subset of them). We use a filter to log all events' type and payload. We're using the filter function much like a `tap`, though filters may also return results or throw exceptions, which we won't go into just yet.

![](http://www.deanius.com/Monolog-2.1.gif)

## 2.2 Process a startup event, and log upon its completion

As we saw, to process many events, you pass an Observable (whose values becomes payloads), and a type, and `agent.subscribe` will process events of those combined types and payloads when the Observable produces a value.

But, what if you just want to process a single event, manually? If you just have a single Flux Standard Action object with `type` and `payload`(optional), you can call `process`.

```diff
     App.subscribe(DOM.changes(), { type: "DOM/change" })
+      const result = App.process({ type: "started!"})
+      result.completed.then(() => {
+        console.log("Started up!")
+      })
```

The return value you get has a `completed` Promise, on which you can attach handlers.

The lesson here is that the code that calls `process` does not, by default know what downstream handlers will respond, or event how many there are, and their exceptions can not even travel back. But the `completed` Promise is a gateway into whatever has happened. We attach a handler to the completed Promise so that we can log that we are `Started up!`

![](http://www.deanius.com/Monolog-2.2.gif)

## 2.3 Incorporate a delay into the startup handling

Code always grows more complex. But Rx-Helper allows your code to accomodate even challenging changes. We add an `on("started!"` handler to run whenever an action of type `started!` is seen, via `process` or `subscribe`.

```diff
+      const { after } = AntaresProtocol;

       /* Interesting DOM Events: #monolog keyup, form submit */
       /* Exposed DOM mutation methods: clear, addToList */
@@ -66,8 +67,15 @@ <h2>Monolog Lines</h2>
       };

       App.addFilter(({ action }) => console.log(action.type, action.payload))
+      App.on("started!", () => {
+        console.log("Starting...")
+        return after(1000, () => console.log("..."))
+      })
+
+
      const result = App.process({ type: "started!"})
      result.completed.then(() => {
        console.log("Started up!")
      })

```

The `after()` function calls its function argument after a delay. Its return value is an Observable, and it must be subscribed to, but by returning it from our `on` handler, the agent subscribes to it, and knows to factor the time it takes to complete into the `completed` Promise we created in the previous step.

This means our log output is now:

![](http://www.deanius.com/Monolog-2.3.gif)

## 2.4 Update a model using a filter; Send the model's value in submit

We don't need a fancy framework to give us a model - we just declare an object with a `line` property and a setter method `setLine` to give us a quick-to-reference copy of what's in the DOM.

Then we use a `filter`, run upon each event of type `DOM/change`, that calls `setLine` to keep that property in sync with the DOM. As a result, after every keyup in the input, `App.model.line` will have the current value of the input.

```diff
         submits() {
           return fromEvent(this.form, "submit").pipe(
-            tap(e => e.preventDefault())
+            tap(e => e.preventDefault()),
+            map(() => App.model.line)
           )
         }
       };

+      App.model = {
+        line: "",
+        setLine(line) {
+          this.line = line
+        }
+      }
       App.addFilter(({ action }) => console.log(action.type, action.payload))
+      App.filter("DOM/change", ({ action })=> App.model.setLine(action.payload))

```

![](http://www.deanius.com/Monolog-2.4.gif)

Now we can finally provide the value of the model's `line` property as the payload of the `DOM/submit` event, similarly to how we did for `DOM/change`. This will make it easy for us to know what to send via AJAX **without** reaching back into the DOM. Now let's do real AJAX!

## 2.5 Let's Do Real AJAX!

Now we can start implementing requirement 6.

```js
const { fromEvent, of } = rxjs;
const { map, tap } = rxjs.operators;
const { ajax } = rxjs.ajax;
const { after, randomId } = AntaresProtocol;

App.on(
  "DOM/submit",
  ({ action }) => {
    const line = action.payload;
    App.process({ type: "AJAX/start" });
    return ajax({
      method: "POST",
      url: "https://jsonplaceholder.typicode.com/posts",
      body: { line }
    }).pipe(map(r => Object.assign(r.response, { id: randomId() })));
  },
  { type: "AJAX/complete" }
);
```

The return value from the `DOM/submit` handler is an `ajax` Observable, piped through a `map` which chooses the `response` property, and alters the `id` property of that object before returning it.

We do this since the mock API we use would return the same id every time, which would be boring.

Also, it's optional, but so that we'll see it in the logs, we explicitly process an `AJAX/start` action. There's no handler for it now, but we'll see it in the logs, and if you want to maintain a global spinner, you'll use some function to show the spinner whenever more `start`s than `complete`s have come through.

The key lesson here is that we're following the same pattern as with `after`. We're returning an Observable from our handler, whose value factors into the `completed` Promise, and we specify that its produced value should be packaged in an action of type `AJAX/complete`, which our filter shows in the console. Fantastic, this is finally starting to make sense!

![](http://www.deanius.com/Monolog-2.5.gif)

## 2.6 Changes the DOM upon AJAX completion

```js
App.on("AJAX/complete", ({ action }) => {
  const { line, id } = action.payload;
  DOM.clear();
  DOM.addToLines(`${line} (${id})`);
});
```

Here we add an `AJAX/complete` handler to call the DOM-updating methods we made for ourselves, using the `id` and `line` that we took care to return from the `ajax` handler that was called for `DOM/submit`.

![](http://www.deanius.com/Monolog-2.6.gif)

While our handlers don't technically need to return Observables, it's good to do so because then they are cancelable, schedulable, and concurrency-tunable - points we'll see more of later, but don't need in this handler. Also, you'll need to return Observables (or Promises) for the duration of the handler to be factored into `result.completed`.

It's lovely isn't it, how the handlers form a chain, connected by `type`s. It results in a very grepp-able codebase! And the cause-and-effect remains very easy to see once the code is written. Filters, or handlers, can be so useful to tap in to what is going on in the system, send events off to an analytics service, etc, _without modifying existing functions or altering the app significantly_.

# Advanced Control, Async

## 2.7 Testing - Simulate Events Upon Startup

Because Observables can be stand-ins for user behavior, they're a perfect tool for test automation. It's fun to see an app actually do something upon load rather than just sit there, we'll never know what we'll see until we try.

```diff
       result.completed.then(() => {
         console.log("Started up!")
+
+        App.subscribe(of('Kraken', 'Thor', 'Zeus'), { type: "DOM/submit" })
       })
```

We use `of` to create an Observable of 3 deity values. Observables don't necessarily have to be async - they can be over even a single quantum of time (synchronous), as this one is. By subscribing to it with type `DOM/submit` the App treats it exactly as though these actions came from the DOM. This effectively causes all the consequential actions from handlers including AJAX and DOM updating to happen as if we typed and submitted them really fast.

![](http://www.deanius.com/Monolog-2.7.gif)

And what do we see? Refresh the page a few times, and we'll see a fundamental problem with the default way of event-handling - async consequences can come back in any order, reducing our predictability. Sometimes this is ok, but it really depends on each case, so it's best to be able to tune concurrency, for correctness, for when order matters, or to reduce resource consumption.

## 2.8 Order Events Serially

Because we were being good and returning Observables from each event handler, and since Observables are lazy/unstarted until subscribed to, our agent has total control over when the ajax actually starts.

And so simply by adding `concurrency: serial` to our config object, we are able to fundamentally alter the beahvior of our app with very little code change.

```js
App.on(
  "DOM/submit",
  ({ action }) => {
    return ajax...
  },
  {
    type: "AJAX/complete",
    concurrency: "serial"
  })
```

![](http://www.deanius.com/Monolog-2.8.gif)

## 2.9 Additionally, render audio

Since handlers are independent, their failures or time spent does not affect others. Let's have fun and actually say a confirmation upon adding to the list.

```js
App.on("AJAX/complete", ({ action, context }) => {
  const { line } = action.payload;
  const { speechSynthesis, SpeechSynthesisUtterance } = window;

  var msg = new SpeechSynthesisUtterance(`Added ${line} to list`);
  speechSynthesis.speak(msg);
});
```

For fun, try running this with concurrency `"cutoff"`, and wrap the speech production in an Observable that returns a cancelation function: `() => speechSynthesis.cancel()`. What happens if multiple handlers are triggered in close succession now?

## 2.10 Isolate Errors

Try throwing an error in either of the event handlers. It will not cancel others (though downstream ones will clearly not fire). What else can you try?

# Conclusion

And that is how you do things the Rx-Helper way!

Questions, comments to: [@deaniusol](www.twitter.com/deaniusol), hashtag #rx-helper
