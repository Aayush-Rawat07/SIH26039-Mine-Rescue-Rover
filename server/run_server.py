#!/usr/bin/env python3
"""
SIH26039: AI-Powered Mine Rescue Rover Ground Control Station
Universal Access Server (Local LAN + Worldwide Public HTTPS Tunnel)
"""

import http.server
import socketserver
import webbrowser
import subprocess
import threading
import urllib.request
import socket
import re
import os
import sys
import time

PORT = 8000
DIRECTORY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOUDFLARED_EXE = os.path.join(os.path.dirname(__file__), "cloudflared.exe")

class DualStackServer(socketserver.TCPServer):
    allow_reuse_address = True

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        # Suppress verbose asset request logs to keep terminal clean
        pass

def get_lan_ip():
    """Finds the primary local network IP for WiFi/LAN access"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def ensure_cloudflared():
    """Ensures cloudflared binary exists, downloads if missing"""
    if os.path.exists(CLOUDFLARED_EXE) and os.path.getsize(CLOUDFLARED_EXE) > 1000000:
        return True
    
    print("[*] Downloading secure tunneling agent (Cloudflare Tunnel)...")
    url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    try:
        urllib.request.urlretrieve(url, CLOUDFLARED_EXE)
        print("[+] Download complete.")
        return True
    except Exception as e:
        print(f"[-] Could not download tunneling agent: {e}")
        return False

def start_tunnel():
    """Starts Cloudflare quick tunnel to expose localhost:8000 to the world"""
    if not ensure_cloudflared():
        return None, None

    cmd = [CLOUDFLARED_EXE, "tunnel", "--url", f"http://127.0.0.1:{PORT}"]
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
    except Exception as e:
        print(f"[-] Error launching tunnel: {e}")
        return None, None

    public_url = None
    start_time = time.time()
    
    # Read stderr for the generated trycloudflare.com URL
    while time.time() - start_time < 20:
        line = proc.stderr.readline()
        if not line:
            continue
        m = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
        if m:
            public_url = m.group(0)
            break

    return proc, public_url

def run():
    os.chdir(DIRECTORY)
    lan_ip = get_lan_ip()
    local_url = f"http://localhost:{PORT}"
    lan_url = f"http://{lan_ip}:{PORT}"

    enable_public = ("--local-only" not in sys.argv)
    tunnel_proc = None
    public_url = None

    print("\n" + "=" * 76)
    print("  SIH26039: THE STATIC SIX - MINE RESCUE GROUND CONTROL STATION (GCS)")
    print("=" * 76)
    print(f"  [1] LOCAL PC ACCESS:      {local_url}")
    print(f"  [2] LAN / SAME WI-FI:     {lan_url}")
    print("      (Open on any phone, tablet, or laptop connected to same network)")

    if enable_public:
        print("\n  [*] Creating instant Worldwide Public HTTPS Link...")
        tunnel_proc, public_url = start_tunnel()
        if public_url:
            print("=" * 76)
            print(f"  >>> PUBLIC INTERNET LINK (ACCESSIBLE TO ALL):")
            print(f"  >>> {public_url}")
            print("=" * 76)
            print("  Share this URL with anyone in the world to view the live dashboard!")
        else:
            print("  [!] Public tunnel could not be initialized, using LAN access.")

    print("\n  Press CTRL + C at any time to shut down the server gracefully.")
    print("=" * 76 + "\n")

    # Auto-open browser
    open_url = public_url if public_url else lan_url
    webbrowser.open(open_url)

    # Start HTTP server on 0.0.0.0 (all interfaces)
    try:
        with DualStackServer(("0.0.0.0", PORT), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Server stopping...")
    finally:
        if tunnel_proc:
            tunnel_proc.terminate()
            try:
                tunnel_proc.wait(timeout=3)
            except Exception:
                tunnel_proc.kill()
        print("[+] Ground Control Station server terminated gracefully.")

if __name__ == "__main__":
    run()
