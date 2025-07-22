# Use Node.js 20 base image
FROM node:20
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Install only production dependencies
COPY ["package.json", "package-lock.json*", "./"]
RUN npm install --production

# Copy all project files
COPY . .

# Expose the port
EXPOSE 3000

# Start the bot
CMD ["npm", "start"]
