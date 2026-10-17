FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    TRUST_PROXY=1
EXPOSE 3000
USER node
CMD ["npm", "start"]
