// userLeft.js
import { removeUser } from './userStatus.js';

export default (payload) => {
  const user = payload?.user?.uuid;
  if (user) {
    removeUser(user);
  }
};
