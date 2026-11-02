# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# VITE_FORCE_HTTPS=true incrusta la redirección a HTTPS en el bundle.
# En local se deja en false para trabajar por HTTP.
ARG VITE_FORCE_HTTPS=false
ENV VITE_FORCE_HTTPS=${VITE_FORCE_HTTPS}

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM nginx:1.27-alpine
COPY templates /etc/nginx/templates
COPY nginx-locations.conf /etc/nginx/sgl-locations.conf
COPY certs /etc/nginx/certs
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
