import sys
import os

# Add current directory to path so we can import app
sys.path.append(os.getcwd())

from app.main import app

print(f"Total Routes: {len(app.routes)}")
for route in app.routes:
    if hasattr(route, "path"):
        print(f"Path: {route.path} | Name: {route.name} | Methods: {route.methods if hasattr(route, 'methods') else 'N/A'}")
