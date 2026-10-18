#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu server (EC2): swap space for builds, Docker, and the firewall.
#   bash deploy/setup-server.sh
set -euo pipefail

if ! swapon --show | grep -q /swapfile; then
  echo "Adding 2 GB swap (next build needs more memory than a small instance has)..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if ! command -v docker >/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

echo "Done. Log out and back in (so Docker works without sudo), then follow deploy/AWS.md step 5."
