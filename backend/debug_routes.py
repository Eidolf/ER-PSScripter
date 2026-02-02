import os
import sys

# Add current directory to path so we can import app
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from app.main import app

print("Registered Routes:")
for route in app.routes:
    if hasattr(route, "path"):
        methods = route.methods if hasattr(route, 'methods') else 'N/A'
        print(f"Path: {route.path} | Name: {route.name} | Methods: {methods}")
