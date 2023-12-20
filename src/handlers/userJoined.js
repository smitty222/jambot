// userJoined.js
import { postMessage } from '../libs/cometchat.js';

// Array to keep track of joined user IDs
const joinedUserIds = [];

export const handleUserJoined = async (payload, room) => {
  try {
    console.log('User joined handler called:');
    console.log('Received Payload:', payload);

    if (!payload.allUserData) {
      console.log('No user data found in payload');
      return;
    }

    const botUserId = process.env.BOT_USER_UUID;

    // Exclude the bot based on user UUID
    const joinedUser = payload.audienceUsers.find(user => user.uuid !== botUserId);

    if (!joinedUser) {
      console.log('User information not found in payload');
      return;
    }

    const userProfile = payload.allUserData[joinedUser.uuid]?.userProfile;

    if (!userProfile || !userProfile.nickname) {
      console.log('User profile or nickname not found');
      return;
    }

    // Check if the current joined user is not in the list
    if (!joinedUserIds.includes(joinedUser.uuid)) {
      // Update the list of joined users
      joinedUserIds.push(joinedUser.uuid);
    }
  } catch (error) {
    console.error('Error handling user joined:', error.message);
  }
};

// Function to get the list of joined users by UUID
export const getUsersList = async (payload, room) => {
  try {
    console.log('Get Users List handler called:');
    console.log('Joined User IDs:', joinedUserIds);

    const usersListMessage = `Current users: ${joinedUserIds.join(', ')}`;

    // Send the list of joined users as a response
    await postMessage({
      room,
      message: usersListMessage,
    });

    console.log(`Users list sent successfully: ${usersListMessage}`);
  } catch (error) {
    console.error('Error handling /getUsers command:', error.message);
  }
};
