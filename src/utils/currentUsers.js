let currentUsers = [];

export const getCurrentUsers = () => currentUsers;

export const updateCurrentUsers = (newUsers) => {
  currentUsers = newUsers;
};
