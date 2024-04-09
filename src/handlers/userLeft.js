// userLeft.js

export default async (payload) => {
    try {
      console.log('User left:', payload); // Log the user who left
  
      // Check if allUserData is available in the payload
      if (payload.allUserData) {
        // Send the list of allUserData to clients
        // You may need to implement the logic to send this data to clients
        console.log('All users data:', payload.allUserData);
      }
    } catch (error) {
      console.error('Error handling userLeft event:', error.message);
    }
  };
  