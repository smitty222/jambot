# syntax=docker/dockerfile:1
# Use a lightweight Alpine image
FROM node:20-alpine

# Set production environment
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy dependency definitions and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# (Optional) Debug: verify database folder contents at build time
RUN echo "Contents of /app/src/database:" && ls -R /app/src/database

# Expose application port
EXPOSE 3000

# Start the bot normally; runtime debug is handled in code
CMD ["npm", "start"]
