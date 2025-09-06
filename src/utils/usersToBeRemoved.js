// src/utils/usersToBeRemoved.js
//
// Shared mutable map of DJ UUIDs that should be removed from the stage
// after their current song finishes. Historically this state lived in
// handlers/message.js which created a circular dependency between the
// bot and the message handler. By hoisting it into its own module we
// avoid coupling unrelated concerns and allow other parts of the
// application to read or modify the removal queue without pulling in
// the entire message handler.  This is a plain object used as a set of
// UUID→true entries; consumers should treat it as read/write state.

// eslint-disable-next-line import/prefer-default-export
export const usersToBeRemoved = {};
