#!/usr/bin/env python3
"""
SIH26039: AI-Powered Mine Rescue Rover Ground Control Station
Local HTTP & Asset Server Launcher
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def run():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 70)
        print(" SIH26039: THE STATIC SIX — MINE RESCUE GROUND CONTROL STATION (GCS)")
        print(f" Web Server Active at: {url}")
        print(" Browser opening automatically...")
        print("=" * 70)
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer shutting down gracefully.")
            httpd.shutdown()

if __name__ == "__main__":
    run()
