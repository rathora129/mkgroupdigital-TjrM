FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json jsconfig.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

RUN addgroup -S worker && adduser -S worker -G worker
USER worker

EXPOSE 4319

CMD ["npm", "run", "ai:worker:prod"]
