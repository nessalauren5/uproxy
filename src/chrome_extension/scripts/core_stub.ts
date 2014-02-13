// Provides 'CoreStub' object that acts like freedomos.org
// freedom object, but posts/listens to messages from freedom via a chrome.
// runtime.message.

// TODO: factor away this file
// This is a fake freedom module builder that simply passes messages to a
// |id| is the chrome extension/app Id that is running Freedom that we
//   should speak to.
// |options| is the options passed the runtime connection. It has a 'name'
//   field that can be used to name the connection to the freedom component.
function CoreStub(id, options) {
  this.id_ = id;
  this.options_ = options;
  // A callback |function() {...}| to call when we are disconnected. e.g. when
  // Freedom extension/app is removed/disabled.
  this.onDisconnected = new chrome.Event();
  // A callback |function() {...}| to call when connected.
  this.onConnected = new chrome.Event();
  // Status object for copnnected. This is an object so it can be bound in
  // angular. connected = true iff connected to the app which is running
  // freedom.
  this.status = { connected: false };
  // The chrome.runtime.Port used to speak to the App/Extension running Freedom.
  this.port_ = null;
  // A freedom-type indexed object where each key provides a list of listener
  // callbacks: e.g. { type1: [listener1_for_type1, ...], ... }
  this.listeners_ = {};
  // Used to remember the callback we need to remove. Because we typically need
  // to bind(this), it's useful to name the callback after the bind so we can
  // actually remove it again.
  this._currentMessageCallback = null;
  this._currentDisconnectCallback = null;
};

// Try to connect to the app/extension running Freedom.
CoreStub.prototype.connect = function() {
  if(this.status.connected) {
    // console.info('Already connected.');
    return;
  }
  console.info('Trying to connect to the app');
  this.port_ = chrome.runtime.connect(this.id_, this.options_);

  try {
    this.port_.postMessage("hi");  // message used just to check we can connect.
    this.status.connected = true;
  } catch (e) {
    console.log("Tried to say hi to app, but failed.");
    this.status.connected = false;
    this.port_ = null;
    return false;
  }

  this._currentDisconnectCallback = this.onDisconnected_.bind(this);
  this.port_.onDisconnect.addListener(this._currentDisconnectCallback);

  this._currentMessageCallback = this.onFirstMessage_.bind(this);
  this.port_.onMessage.addListener(this._currentMessageCallback);
};

// This function is used as the callback to listen to messages that should be
// passed to the freedom listeners in the extension.
CoreStub.prototype.dispatchFreedomEvent_ = function(msg) {
  if (this.listeners_[msg.type]) {
    var handlers = this.listeners_[msg.type].slice(0);
    for (var i = 0; i < handlers.length; i++) {
      handlers[i](msg.data)
    }
  }
};

// This is used to know when we are connected to Freedom (there is no callback
// possible on the connector side of a runtime connection [25 Aug 2013])
// When we connect Freedom, we expect Freedom's runtime.Port.onConnect callback
// to send us the message 'hello.' which means we've connected successfully.
CoreStub.prototype.onFirstMessage_ = function(msg) {
  if ('hello.' == msg) {
    console.info('Got hello from UProxy App.');
    // No longer wait for first message.
    // Relay any messages to this port to any function that has registered as
    // wanting to listen using an 'freedom.on' from this connector.
    this.port_.onMessage.removeListener(this._currentMessageCallback);
    this._currentMessageCallback = this.dispatchFreedomEvent_.bind(this);
    this.port_.onMessage.addListener(this._currentMessageCallback);
    // If we have an |onConnected| callback, call it.
    this.onConnected.dispatch();
  } else {
    console.warn('Unexpected message from UProxy App: ' + msg);
  }
};

// Wrapper for disconnection.
CoreStub.prototype.onDisconnected_ = function() {
  console.log('Extension got disconnected from app.');
  this.status.connected = false;
  if(this.port_) {
    if(this._currentMessageCallback) {
      this.port_.onMessage.removeListener(this._currentMessageCallback);
      this._currentMessageCallback = null;
    }

    if(this._currentDisconnectCallback) {
      this.port_.onDisconnect.removeListener(this._currentDisconnectCallback);
      this._currentDisconnectCallback = null;
    }

    this.port_.disconnect();
    this.onDisconnected.dispatch();
    //delete this.onDisconnected;
    //delete this.onConnected;
    //this.onDisconnected = new chrome.Event();
    //this.onConnected = new chrome.Event();
    this.port_ = null;
  }

  this.listeners_ = {};
};


// send emit to Freedom.
CoreStub.prototype.emit = function(t, d) {
  if (!this.status.connected) {
    console.error('Cannot call |emit| on a disconnected CoreStub.');
    return;
  }
  try {
    this.port_.postMessage({
      cmd: 'emit',
      type: t,
      data: d
    });
  } catch (e) {
    console.warn("emit: postMessage Failed. Disconnecting.");
    this.onDisconnected_();
  }
};

// Add the listener callback to be called when we get events of type |t|
// from freedom.
CoreStub.prototype.on = function(t, listener) {
  if (!this.status.connected) {
    console.error('Cannot call |on| on a disconnected CoreStub.');
    return;
  }
  if (this.listeners_[t]) {
    this.listeners_[t].push(listener);
  } else {
    this.listeners_[t] = [listener];
  }
  try {
    this.port_.postMessage({
      cmd: 'on',
      type: t
    });
  } catch (e) {
    console.warn("on: postMessage Failed. Disconnecting.");
    this.onDisconnected_();
  }
};

// Add the listener callback to be called once when we get an event of type
// |t|.
// TODO: Test this.
// Calls listener only once and then remove it.
CoreStub.prototype.once = function(t, listener) {
  if (!this.status.connected) {
    console.error('Cannot call |once| on a disconnected CoreStub.');
    return;
  }
  // Function that calls and removes the listener
  var func = function (data) {
    var idx = this.listeners_[t].indexOf(this);
    this.listeners_[t] = this.listeners_[t].splice(idx, 1);
    listener(data);
  };
  if (this.listeners_[t]) {
    this.listeners_[t].push(func);
  } else {
    this.listeners_[t] = [func];
  }
  try {
    this.port_.postMessage({
      cmd: 'once',
      type: t
    });
  } catch (e) {
    console.warn("once: postMessage Failed. Disconnecting.");
    this.onDisconnected_();
  }
};