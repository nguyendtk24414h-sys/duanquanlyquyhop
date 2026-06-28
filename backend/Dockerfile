FROM node:lts-slim

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
ENV PORT=3000

CMD ["npm", "start"]
