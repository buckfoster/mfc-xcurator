FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3300
CMD ["node", "src/index.js"]
