# =========================
# Build
# =========================
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# =========================
# Serve (Nginx SPA)
# =========================
FROM nginx:alpine

# Copiar build de React
COPY --from=build /app/dist /usr/share/nginx/html

# Copiar configuración Nginx SPA
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
