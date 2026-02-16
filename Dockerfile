FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./

ENV YARN_CACHE_FOLDER=/yarn-cache

RUN yarn install --immutable

COPY . .

EXPOSE 3000

CMD ["sh", "-lc", "yarn dev -p 3000 -H 0.0.0.0"]