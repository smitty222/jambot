# Turntable Live Artist Bot
This is a bot that will join a hangout of your choosing as a fan of a specified artist and will answer questions asked directly to it and give some details about songs played by that artist.

## Running locally
Clone the source and run `npm install`. In developement you can run use `npm run dev` where the nodemon will automatically reestart your project on any changes.

### Redis
You'll need a loacal instance of redis running. Please use [this guide](https://redis.io/docs/getting-started/).

### Configuring variables
There are a number of varaibles needed to run this project and connect to the TTL Hangout. For help getting any of these values, please connect to the Turntable LIVE discord [here](https://discord.com/channels/812448637425680394/1006608336092938381/1007358948267008052)
```
NODE_ENV=development
LOG_LEVEL=debug

REDIS_HOST=localhost

CHAT_TOKEN=
CHAT_USER_ID=
CHAT_REPLY_ID=
CHAT_API_KEY=
CHAT_AVATAR_ID=
CHAT_NAME=
CHAT_COLOUR=

ROOM_UUID=
TTL_USER_TOKEN=
BARD_COOKIE=
OPENAI_API_KEY=

FAVOURITE_ARTIST=
MERCH_RESPONSE_KEYWORDS=
MERCH_MESSAGE=
MERCH_MESSAGE_RANDOM=
MERCH_MESSAGE_RANDOM_SONG_COUNT=
ANNOUNCE_SONG_DETAILS_COUNT=
```

`CHAT_TOKEN` should be the auth token provided when setting up your commet chat bot.  
`CHAT_USER_ID` & `CHAT_REPLY_ID` are the two IDs that will be associated with your bot via commet chat - these are used to prevent the bot talking to itself.  
`CHAT_API_KEY` is the key to allow connection to the TTL comet chat instance.  
`CHAT_AVATAR_ID` is the avatar that the bot should use within chat - the options availabe can be obtained via request on Discord.  
`CHAT_NAME` is the name your bot should label itself with (also used to respond to mentions).  
`CHAT_COLOUR` is the font colour to use for the bots namke in sent messages.  
`ROOM_UUID` is the UUID for the room you will be accessing (can be obtained from [here](https://rooms.prod.tt.fm/api/#/Rooms%20data/getRoom)).  
`TTL_USER_TOKEN` Is your JWT to access TTL (you can grab this from any netwrok requests made via your browser).  
`BARD_COOKIE` is used for the connection to the Bard API - please see [the package documentation](https://www.npmjs.com/package/bard-ai) to obtain this value.  
`OPENAI_API_KEY` as a fallback to Bard, the service can also use OpenAI. Please create an account and get an access key [here](https://openai.com/).  
`FAVOURITE_ARTIST` is the artist name that will be used to form the bot's personality and to know which songs to respond to automatically.  
`MERCH_RESPONSE_KEYWORDS` this can be a comma separated list of keywords that the bot should respond to with the following;  
`MERCH_MESSAGE` The message to respond when trigger, as above.  
`MERCH_MESSAGE_RANDOM` A random version of the merch message that will trigger on a set number of plays of songs by the favourite artist.  
`MERCH_MESSAGE_RANDOM_SONG_COUNT` How many songs to play before sending the above message.  
`ANNOUNCE_SONG_DETAILS_COUNT` How many songs by the favourite artist should play before telling the user about the current song.

### Testing & Linting
The project uses [standard.js](https://standardjs.com/) for linting and [mocha.js](https://mochajs.org/) for testing with [istanbul / nyc](https://istanbul.js.org/) for coverage reporting.  
These will all run using `npm test`, but you can also take advantadge of standard.js' ability to fix simple errors using `npm run lint:fix`.  
This project also takes advantadge of Github actions to run tests when code is pushed up to a branch.  
**(NOTE: most functionality is not yet covered by tests)**

## Running in production
A `Dockerfile` is included should you wish to containerise to run in production.# turntablebot
