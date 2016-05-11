/**
 * @file State.js
 */

import Gesture from './../../gestures/Gesture.js';
import Expand from './../../gestures/Expand.js';
import Pan from './../../gestures/Pan.js';
import Pinch from './../../gestures/Pinch.js';
import Rotate from './../../gestures/Rotate.js';
import Swipe from './../../gestures/Swipe.js';
import Tap from './../../gestures/Tap.js';
import Binding from './Binding.js';
import Input from './Input.js';
import util from './../util.js';

const DEFAULT_MOUSE_ID = 0;

/**
 * Creates an object related to a Region's state, and contains helper methods to update and clean up different
 * states.
 */
class State {

  /**
   * Constructor for the State class.
   */
  constructor(regionId) {

    /**
     * The id for the region this state is bound to.
     * @type {String}
     */
    this.regionId = regionId;

    /**
     * An array of current and recently inactive Input objects related to a gesture.
     * @type {Input}
     */
    this.inputs = [];

    /**
     * An array of Binding objects; The list of relations between elements, their gestures, and the handlers.
     * @type {Binding}
     */
    this.bindings = [];

    /**
     * The number of gestures that have been registered with this state
     * @type {Number}
     */
    this.numGestures = 0;

    /**
     * A key/value map all the registered gestures for the listener. Note: Can only have one gesture registered to one key.
     * @type {Object}
     */
    this.registeredGestures = {};

    this.registerGesture(new Expand(), 'expand');
    this.registerGesture(new Pan(), 'pan');
    this.registerGesture(new Rotate(), 'rotate');
    this.registerGesture(new Pinch(), 'pinch');
    this.registerGesture(new Swipe(), 'swipe');
    this.registerGesture(new Tap(), 'tap');
  }

  /**
   * Creates a new binding with the given element and gesture object.
   * If the gesture object provided is unregistered, it's reference will be saved in as a binding to
   * be later referenced.
   * @param  {Element} element - The element the gesture is bound to.
   * @param {String|Object} gesture  - Either a name of a registered gesture, or an unregistered
   *  Gesture object.
   * @param {Function} handler - The function handler to be called when the event is emitted.
   * Used to bind/unbind.
   * @param {Boolean} capture - Whether the gesture is to be detected in the capture of bubble
   * phase. Used to bind/unbind.
   * @param {Boolean} bindOnce - Option to bind once and only emit the event once.
   */
  addBinding(element, gesture, handler, capture, bindOnce) {
    var boundGesture;

    //Error type checking.
    if (element && typeof element.tagName === 'undefined') {
      throw new Error('Parameter element is an invalid object.');
    }

    if (typeof handler !== 'function') {
      throw new Error('Parameter handler is invalid.');
    }

    if (typeof gesture === 'string' && Object.keys(this.registeredGestures).indexOf(gesture) === -1) {
      throw new Error('Parameter ', gesture, ' is not a registered gesture');
    } else if (typeof gesture === 'object' && !(gesture instanceof Gesture)) {
      throw new Error('Parameter ', gesture, 'is not of a Gesture type');
    }

    if (typeof gesture === 'string') {
      boundGesture = this.registeredGestures[gesture];
    } else {
      boundGesture = gesture;
      this.assignGestureId(boundGesture);
    }

    this.bindings.push(new Binding(element, boundGesture, handler, capture, bindOnce));
    element.addEventListener(boundGesture.getId(), handler, capture);
  }

  /*addBinding*/

  /**
   * Retrieves the Binding by which an element is associated to.
   * @param {Element} element - The element to find bindings to.
   * @returns {Array} - An array of Bindings to which that element is bound
   */
  retrieveBindingsByElement(element) {
    var matches = [];
    this.bindings.map(binding => {
      if (binding.element === element) {
        matches.push(binding);
      }
    });
    return matches;
  }

  /*retrieveBindingsByElement*/

  /**
   * Retrieves all bindings based upon the initial X/Y position of the inputs.
   * e.g. if gesture started on the correct target element, but diverted away into the correct region,
   * this would still be valid.
   * @returns {Array} - An array of Bindings to which that element is bound
   */
  retrieveBindingsByInitialPos() {
    var matches = [];
    this.bindings.forEach(binding => {
      // Determine if at least one input is in the target element. They should all be in the region based upon a prior check
      var inputsInside = this.inputs.filter(input => {
        return util.isInside(input.initial.x, input.initial.y, binding.element);
      });
      if (inputsInside.length > 0) {
        matches.push(binding);
      }
    });
    return matches;
  }

  /* retrieveBindingsByInitialPos */

  /**
   * Updates the inputs with new information based upon a new event being fired.
   * @param {Event} event - The event being captured
   * @param {Element} regionElement - The element where this current Region is bound to.
   * @returns {boolean} - returns true for a successful update, false if the event is invalid.
   */
  updateInputs(event, regionElement) {
    var identifier = DEFAULT_MOUSE_ID;
    var eventType = (event.touches) ? 'TouchEvent' : (event.pointerType) ? 'PointerEvent' : 'MouseEvent';

    switch (eventType) {
      case 'TouchEvent':

        //Return if all gestures did not originate from the same target
        if (event.touches.length !== event.targetTouches.length) {
          return false;
        }

        for (var index in event.changedTouches) {
          if (event.changedTouches.hasOwnProperty(index) && util.isInteger((parseInt(index)))) {
            identifier = event.changedTouches[index].identifier;
            update(event, this, identifier, regionElement);
          }
        }

        break;

      case 'PointerEvent':
        identifier = event.pointerId;
        update(event, this, identifier, regionElement);
        break;

      case 'MouseEvent':
      default:
        update(event, this, DEFAULT_MOUSE_ID, regionElement);
        break;
    }
    return true;

    function update(event, state, identifier, regionElement) {
      var eventType = util.normalizeEvent(event.type);
      var input = findInputById(state.inputs, identifier);

      //A starting input was not cleaned up properly and still exists.
      if (eventType === 'start' && input) {
        state.resetInputs();
        return;
      }

      //An input has moved outside the region.
      if (eventType !== 'start' && input && !util.isInside(input.current.x, input.current.y, regionElement)) {
        state.resetInputs();
        return;
      }

      if (eventType !== 'start' && !input) {
        state.resetInputs();
        return;
      }

      if (eventType === 'start') {
        state.inputs.push(new Input(event, identifier));
      } else {
        input.update(event, identifier);
      }
    }
  }

  /* updateInputs */

  /**
   * Removes all inputs from the state, allowing for a new gesture.
   */
  resetInputs() {
    this.inputs = [];
  }

  /* resetInputs */

  /**
   * Counts the number of active inputs at any given time.
   * @returns {Number} - The number of active inputs.
   */
  numActiveInputs() {
    var endType = this.inputs.filter(input => {
      return input.current.type !== 'end';
    });
    return endType.length;
  }

  /* numActiveInputs */

  /**
   * Register the gesture to the current region.
   * @param {Object} gesture - The gesture to register
   * @param {String} key - The key to define the new gesture as.
   */
  registerGesture(gesture, key) {
    this.assignGestureId(gesture);
    this.registeredGestures[key] = gesture;
  }

  /* registerGesture */

  /**
   * Tracks the gesture to this state object to become uniquely identifiable.
   * Useful for nested Regions.
   * @param {Gesture} gesture - The gesture to track
   */
  assignGestureId(gesture) {
    gesture.setId(this.regionId + '-' + this.numGestures++);
  }

  /* assignGestureId */

}
/**
 * Searches through each input, comparing the browser's identifier key for touches, to the stored one
 * in each input
 * @param {Array} inputs - The array of inputs in state.
 * @param {String} identifier - The identifier the browser has assigned.
 * @returns {Input} - The input object with the corresponding identifier, null if it did not find any.
 */
function findInputById(inputs, identifier) {
  for (var i = 0; i < inputs.length; i++) {
    if (inputs[i].identifier === identifier) {
      return inputs[i];
    }
  }

  return null;
}
/* findInputById */

export default State;
