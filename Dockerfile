# Use Node.js 20 base image
FROM node:20

ENV NODE_ENV=production
WORKDIR /app

# Install production deps reproducibly
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app code
COPY . .

# Fly will route to whatever PORT we listen on; expose 8080 for clarity
ENV PORT=8080
EXPOSE 8080

# Run the bot + health server
CMD ["node", "bin/start.js"]
