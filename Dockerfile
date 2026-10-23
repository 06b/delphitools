# syntax=docker/dockerfile:1
FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# prerender needs chrome; nginx falls back to index.html instead
RUN npx vite build

FROM nginx:1.29-alpine
COPY config/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
