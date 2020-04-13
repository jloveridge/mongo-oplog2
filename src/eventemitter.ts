
// We use require syntax here because eventemitter3 is not a ES6 module,
// so if we use the other syntax it will be broken either when esModuleInterop
// is on or when it's off depending on how we do it

// tslint:disable-next-line: no-require-imports
import EventEmitter = require("eventemitter3");

// In order to keep this hack in one place we put it in a separate file
export default EventEmitter;
