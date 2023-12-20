// userStatus.js
let currentUsers = [];

export const addUser = (user) => {
  currentUsers.push(user);
};

export const removeUser = (user) => {
  currentUsers = currentUsers.filter((u) => u !== user);
};

export const getCurrentUsers = () => {
  return currentUsers;
};
