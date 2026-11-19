"""Ouvre l'Atelier NSI dans le navigateur, depuis les fichiers du dossier site."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
import webbrowser

SITE = Path(__file__).resolve().parent / "site"
ADDRESS = "127.0.0.1"
PORT = 8000

def main():
    if not (SITE / "index.html").is_file():
        print("Le dossier site manque. Extrayez tout le fichier ZIP et réessayez.")
        return 1
    handler = partial(SimpleHTTPRequestHandler, directory=str(SITE))
    try:
        server = ThreadingHTTPServer((ADDRESS, PORT), handler)
    except OSError as error:
        print(f"Impossible de démarrer sur le port {PORT} : {error}")
        return 1
    url = f"http://{ADDRESS}:{PORT}/"
    with server:
        print(f"Atelier NSI : {url}")
        print("Gardez cette fenêtre ouverte. Pour arrêter l’atelier, appuyez sur Ctrl+C.")
        launcher = Timer(0.3, webbrowser.open, args=(url,))
        launcher.daemon = True
        launcher.start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nAtelier arrêté.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
