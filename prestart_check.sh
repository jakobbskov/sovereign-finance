cd /app
node -c static/app.js || { echo "JS SYNTAX ERROR - aborting deploy"; exit 1; }
