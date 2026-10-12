#!/bin/bash
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8080") >/dev/null 2>&1 &
node server.mjs
