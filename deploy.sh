#!/bin/bash
# Mission Control — Deploy Script para VPS (187.77.43.141)
# Uso: ./deploy.sh

set -e

VPS="root@187.77.43.141"
APP_DIR="/opt/mission-control"

echo "==> Enviando arquivos para o VPS..."
rsync -az --exclude node_modules --exclude .next/cache \
  ./ $VPS:$APP_DIR/

echo "==> Instalando dependências no VPS..."
ssh $VPS "cd $APP_DIR && npm ci"

echo "==> Buildando no VPS..."
ssh $VPS "cd $APP_DIR && npm run build"

echo "==> Reiniciando servidor..."
ssh $VPS "cd $APP_DIR && pm2 restart mission-control || pm2 start npm --name mission-control -- start -- --port 3001"

echo "==> Deploy concluído! Acesse http://187.77.43.141:3001"
