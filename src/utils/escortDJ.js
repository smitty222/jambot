import { currentsongduration } from "./API.js";
import { roomBot } from "../index.js";

async function escortUserFromDJStand(userUuid) {
    try {
        const songDuration = await currentsongduration(); 
        
        if (!songDuration) {
            throw new Error('No song is currently playing.');
        }
        setTimeout(async () => {
            try {
                await roomBot.removeDJ(userUuid);
            } catch (error) {
            }
        }, songDuration * 1000); 
    } catch (error) {
        console.error('Error escorting user from DJ stand:', error);
    }
}

export { escortUserFromDJStand }
