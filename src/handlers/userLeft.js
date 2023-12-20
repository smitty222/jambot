export const handleUserLeft = (payload) => {
    try {
      console.log('User left handler called:');
      console.log('Received Payload:', payload);
  
      if (!payload.audienceUser) {
        console.log('No audience user data found in payload');
        return;
      }
  
      const leftUserId = payload.audienceUser.uuid;
  
      // Remove the left user from the list of joined users
      joinedUserIds = joinedUserIds.filter(userId => userId !== leftUserId);
  
      console.log(`User ${leftUserId} left the room`);
    } catch (error) {
      console.error('Error handling user left event:', error.message);
    }
  };