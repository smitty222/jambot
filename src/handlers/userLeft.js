import { fetchCurrentUsers } from "../utils/API.js";
import { updateCurrentUsers } from "../utils/currentUsers.js";

export default async (payload) => {
  try {
    console.log('User left:'); // Log the user who left

    // Fetch current users
    const updatedUsers = await fetchCurrentUsers();

    // Update currentUsers
    updateCurrentUsers(updatedUsers);

    console.log('Updated current room users:', updatedUsers);
  } catch (error) {
    console.error('Error handling userLeft event:', error.message);
  }
};
