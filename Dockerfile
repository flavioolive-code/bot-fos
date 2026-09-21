FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN npm run build

EXPOSE 3000

ENV NODE_OPTIONS="--max-old-space-size=4096"

CMD ["npm", "run", "dev"]
