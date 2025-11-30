#!/bin/bash
# Script untuk run multiple instances di Windows (Git Bash)

# Instance 1 - Port 5173 (default)
echo "🚀 Starting Instance 1 on port 5173..."
npm run dev &
PID1=$!

# Wait a bit
sleep 3

# Instance 2 - Port 5174
echo "🚀 Starting Instance 2 on port 5174..."
PORT=5174 npm run dev &
PID2=$!

echo ""
echo "✅ Both instances started!"
echo "📱 Instance 1: http://localhost:5173"
echo "📱 Instance 2: http://localhost:5174"
echo ""
echo "Press Ctrl+C to stop all instances"

# Trap Ctrl+C untuk kill semua process
trap "kill $PID1 $PID2; exit" INT

# Keep script running
wait
