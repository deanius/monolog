# The Monolog App, Implemented in Polyrhythm

Quick Links: [Live App](http://www.deanius.com/monolog.html) | [Monolog Repo](https://github.com/deanius/monolog) | [polyrhythm Repo](https://github.com/deanius/polyrhythm) | [Original Monolog App](https://github.com/kimjoar/writings/blob/master/published/understanding-backbone.md)

To help you understand how Polyrhythm helps you write apps with:

- Decoupled code
- Error isolation
- Simple-to-make and maintain non-blocking async code

an app called Monolog, which [here](https://github.com/kimjoar/writings/blob/master/published/understanding-backbone.md) was implemented both in JQuery and Backbone, was built in the Polyrhythm style.

This means in the new style, the app:

1. Communicates what is to happen via events- plain-old JS objects with type(String) and payload(any) fields (see Flux Standard Action).
1. Specifies consequences inside error-isolated listeners which respond to a subset of events.
1. Returns Observables from event listeners, so that the execution of those listeners can be queued, or otherwise fine-tuned as needs change.
1. Allow for declarative timing control.

Let's elaborate on each of these points:

**1)** The point about working via Events can be understood as the Redux, or Command-Object pattern. Instead of a `store` receiving actions via `dispatch` (as in Redux), a `channel` receives events via `trigger`. Everything needed to fulfill the consequences of an event is bundled up in its payload - so when you get an event that text changed, you won't have to look up from the DOM, you'll have it in the event.

**2)** If your app does multiple things in response to an event (send analytics, save to server, update UI), it's unlikely there's any intentional order dependency between them. Or at least - if one fails, you seldom want the others to fail. Listeners become independent entities whose uncaught exceptions are limited to turning them off and logging a message. It's like intentionally blowing a fuse to save the rest of the system.

**3)** The point about using Observables instead of events is that an Observable is a single object which can provide values over time. As such it is a perfect data type to model:

- A user's mouse movements
- A server's return value
- A websocket's events
- Events a DOM can raise

The design benefit of Observables lies in how our application can be split into a WHAT and a HOW section, connected by Observables, where the Observable is a stream of WHAT, upon which you'll attach consequences in the HOW section. Programs built this way are highly decoupled, and test-drivable.

**4)** In regular DOM event handling, if events are produced too rapidly, multiple event listeners may be running for the same event type simultaneously. When resources, or ordering semantics are important, it may be better to queue up handling, terminate previous or long-running ones, or block new listeners from firing until a previous has completed. In Polyrhythm, each listener can be parameterized by a different strategy— parallel, serial, replace, ignore or toggle— without rewriting the code, and whether the work to be done is synchronous or async!

Now, let's check out how this plays out in the actual Monolog application.

# The App

The monolog app is a TODO list style app with the following specifications:

1. An input, a list, and a submit button are present.
1. A user may type text into the input.
1. A user may click submit.
1. Upon submit, the text from the input should go into a list.
1. Upon submit, the text from the input should be cleared.
1. Upon submit, the text should be sent to an AJAX endpoint.

![](http://www.deanius.com/Monolog-2.6.gif)

# The Code

The commits required to build this are laid out below with commentary.

First we'll talk about encapsulating the DOM.

Second, we'll build an App that controls it out of an Polyrhythm `channel` that we'll call App.

Lastly, we'll tune the app's concurrency and show how `App` can grow in functionality safely with minimal fear of new features breaking old ones, and maximum testability.

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

## 1.1 Define a DOM layer

In order to be able implement requirements 4 & 5, we'll need to write to the DOM.

Now's a good time to group all the things we care about the DOM - the elements we listen to events from or change, the changes we want to do - into a single object.

```js
/* Interesting DOM Events: #monolog keyup, form submit */
/* Exposed DOM mutation methods: clear, addToList */
const DOM = {
  line: document.getElementById("monolog-line"),
  lines: document.getElementById("lines"),
  form: document.getElementById("form"),
  clearLine() {
    this.line.value = "";
  },
  addToLines(line) {
    this.lines.innerHTML += `<li>${line}</li>`;
  },
};

window.DOM = DOM;
```

We can try these out by calling `DOM.clear()` in the console for example.

![](http://www.deanius.com/Monolog-1.1.gif)

# The App

## 2.0 Abstract over the event bus.

For clarity, let's create an object called App out of polyrhythm's primitives.

```js
import { trigger, listen, filter } from "polyrhythm";

const App = {
  trigger,
  listen,
  filter,
};
```

We see how the channel named `App` can have filters: synchronous functions which run upon every event (or some subset of them). We use a filter to log all events' type and payload. We're using the filter function much like a `tap`, though filters may also return results or throw exceptions, which we'll explore later.

![](http://www.deanius.com/Monolog-2.1.gif)

## 2.1 Process a startup event, and log upon its completion

If you just want to trigger a single event, you specify its tyoe

```js
App.filter("started!", () => console.log("Started up!"));
App.trigger("started!");
```

The lesson here is that the code that calls `trigger` does not know or care what downstream listeners will respond, or event how many there are, and their exceptions can not even travel back. With the listener for logging added above

![](http://www.deanius.com/Monolog-2.2.gif)

## 2.3 Update a model using a filter; Send the model's value in submit

We don't need a fancy framework to give us a model - we just declare an object with a `line` property to give us a quick-to-reference copy of what's in the DOM.

Then we use a `filter`, run upon each event of type `DOM/change`, that calls `setLine` to keep that property in sync with the DOM. As a result, after every keyup in the input, `App.model.line` will have the current value of the input.

```js
App.model = {
  line: "",
  setLine(line) {
    this.line = line;
  },
};

App.filter("DOM/change", ({ payload }) => App.model.setLine(payload));

DOM.form.onsubmit = (event) => {
  event.preventDefault();
  App.trigger("DOM/submit", App.model.line);
};
DOM.line.onkeyup = ({ target }) => {
  App.trigger("DOM/change", target.value);
};
```

![](http://www.deanius.com/Monolog-2.4.gif)

Now we can finally provide the value of the model's `line` property as the payload of the `DOM/submit` event, similarly to how we did for `DOM/change`. This will make it easy for us to know what to send via AJAX **without** reaching back into the DOM. Now let's do real AJAX!

## 2.4 Let's Do Real AJAX!

Now we can start implementing real Ajax!

```js
const { map, tap } = rxjs.operators;
const { ajax } = rxjs.ajax;
const { after, randomId } = poly;
//prettier-ignore
App.listen(
  "DOM/submit",
  ({ type, payload }) => {
    const line = payload;
    App.trigger("AJAX/start");
    return ajax({
      method: "POST",
      url: "https://jsonplaceholder.typicode.com/posts",
      body: { line },
    }).pipe(
      map(({ response }) =>
        App.trigger("AJAX/complete", { ...response, id: randomId() })
      )
    );
  }
);
```

The return value from the `DOM/submit` listener is an `ajax` Observable, piped through a `map` which chooses the `response` property, and adds the `id` property of that object before returning it.

We do this since the mock API we use would return the same id every time, which would be boring.

Also, it's optional, but so that we'll see it in the logs, we explicitly trigger an `AJAX/start` event. There's no listener for it now, but we'll see it in the logs, and if you want to maintain a global spinner, you'll use some function to show the spinner whenever more `start`s than `complete`s have come through.

The key lesson here is that we're returning an Observable from our listener, whose value factors into the `completed` Promise, and we specify that its produced value should be packaged in an event of type `AJAX/complete`, which our filter shows in the console. Fantastic, this is finally starting to make sense!

![](http://www.deanius.com/Monolog-2.5.gif)

## 2.5 Change the DOM upon AJAX completion

```js
App.listen("AJAX/complete", ({ payload }) => {
  const { line, id } = payload;
  DOM.clear();
  DOM.addToLines(`${line} (${id})`);
});
```

Here we add an `AJAX/complete` listener to call the DOM-updating methods we made for ourselves, using the `id` and `line` that we took care to return from the `ajax` listener that was called for `DOM/submit`.

![](http://www.deanius.com/Monolog-2.6.gif)

While our listeners don't technically need to return Observables, it's good to do so because then they are cancelable, schedulable, and concurrency-tunable - points we'll see more of later, but don't need in this listener. Also, you'll need to return Observables (or Promises) for the duration of the listener to be factored into `result.completed`.

It's lovely isn't it, how the listeners form a chain, connected by `type`s. It results in a very grepp-able codebase! And the cause-and-effect remains very easy to see once the code is written. Filters, or listeners, can be so useful to tap in to what is going on in the system, send events off to an analytics service, etc, _without modifying existing functions or altering the app significantly_.

## 2.6 Testing - Simulate Events Upon Startup

Because Observables can be stand-ins for user behavior, they're a perfect tool for test automation. It's fun to see an app actually do something upon load rather than just sit there, we'll never know what we'll see until we try.

```js
//prettier-ignore
["Kraken", "Thor", "Zeus"].forEach(deity =>
  App.trigger("DOM/submit", deity)
);
```

By triggering events with type `DOM/submit` the App treats it exactly as though these events came from the DOM. This effectively causes all the consequential effects from listeners including AJAX and DOM updating to happen as if we typed and submitted them really fast.

![](http://www.deanius.com/Monolog-2.7.gif)

And what do we see? Refresh the page a few times, and we'll see a fundamental problem with the default way of event-handling - async consequences can come back in any order, reducing our predictability. Sometimes this is ok, but it really depends on each case, so it's best to be able to tune concurrency, for correctness, for when order matters, or to reduce resource consumption.

# Advanced - Declarative Concurrency/Timing Control

## 3.0 Order Events Serially

Because we were being good and returning Observables from each event listener, and since Observables are deferred until subscribed to, our channel has total control over when the ajax actually starts.

And so simply by adding `mode: serial` to our config object, we are able to fundamentally alter the behavior of our app with very little code change.

```js
App.listen(
  "DOM/submit",
  event => {
    return ajax...
  },
  {
    mode: "serial"
  })
```

![](http://www.deanius.com/Monolog-2.8.gif)

## 3.1 Additionally, play audio

Since listeners are independent, their failures or time spent does not affect others. Let's have fun and actually say a confirmation upon adding to the list.

```js
App.listen("AJAX/complete", ({ payload }) => {
  const { line } = payload;
  const { speechSynthesis, SpeechSynthesisUtterance } = window;

  var msg = new SpeechSynthesisUtterance(`Added ${line} to list`);
  speechSynthesis.speak(msg);
});
```

This Speech API, unlike some others, automatically queues utterances, so we don't need to specify `mode: 'serial'` as before.
For fun, try running this with ConcurrencyMode `"replace"`, and wrap the speech production in an Observable that returns a cancelation function: `() => speechSynthesis.cancel()`. What happens if multiple listeners are triggered in close succession now?

# Conclusion

I hope you've seen now how well-factored JS applications can be built solely from events, and their timing fine-tuned with a good event bus abstraction like polyrhythm.
Features like views which auto-update in response to models can be layered on later, but this serves as an introduction to some fundamentals that work even outside the OO or Backbone or JQuery world.

I'd appreciate your questions, comments or feedback at: [@deaniusol](www.twitter.com/deaniusol), or use hashtag #polyrhythm
