# syntax=docker/dockerfile:1
# Use a lightweight Alpine image
FROM node:20-alpine

# Set production environment
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy dependency definitions and install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# (Debug) Verify database folder is included in build context
RUN echo "Contents of /app/src/database:" && ls -R /app/src/database

# Expose application port
EXPOSE 3000

# Launch the bot
CMD ["npm", "start"]
