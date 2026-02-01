git fetch
git reset --hard origin/main
docker compose build soccer-manager --no-cache
docker compose down soccer-manager
docker compose up soccer-manager -d
docker system prune -f
