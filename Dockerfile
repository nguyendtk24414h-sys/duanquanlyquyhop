FROM node:lts-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
ENV PORT=3000

CMD ["npm", "start"]
