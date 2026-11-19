"""Reconstruit le catalogue à partir de l'archive de la session 2025."""
import ast
import io
import json
import re
import subprocess
import sys
import tempfile
import tokenize
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
TITLES = [line.split(';') for line in (ROOT / 'src/titres.txt').read_text().splitlines()]
PAGES = re.compile(r'(?im)^\s*EXERCICE\s+2\s*\(10 points\)')
EXAMPLES = re.compile(r'^\s*>>>\s?(.*)$')

def local_code(filename):
    with tokenize.open(filename) as stream:
        return stream.read()

def examples(pages):
    """Ne reprend que les appels autonomes suivis d'une valeur littérale."""
    lines = '\n'.join(pages).splitlines()
    found = []
    for i, line in enumerate(lines[:-1]):
        match = EXAMPLES.match(line)
        if not match:
            continue
        expr = match[1].strip()
        expected = lines[i + 1].strip()
        try:
            call = ast.parse(expr, mode='eval').body
            if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Name):
                continue
            for arg in call.args:
                ast.literal_eval(arg)
            if call.keywords:
                continue
            ast.literal_eval(expected)
        except (SyntaxError, ValueError):
            if 'renvoie None' in expr:
                expected = 'None'
            else:
                continue
        if not re.match(r'^\w+\(', expr):
            continue
        found.append({'expr': expr.split(' # ')[0].rstrip(), 'expected': expected})
    return found

def manual(expr, expected, setup='', label=''):
    return {'expr': expr, 'expected': expected, 'setup': setup, 'label': label}

EXTRA = {
    '01-1': [manual(
        'type(resultat) is list and sorted(resultat) == [2, 3]', 'True',
        'resultat = voisins_entrants([[1, 2], [2], [0], [0]], 0)',
        'Retrouver les voisins entrants du sommet 0'),
        manual('voisins_entrants([[1, 2], [2], [0], [0]], 1)', '[0]')],
    '15-2': [manual('chercher([1, 5, 6, 6, 9, 12], 7, 0, 5)', 'None'),
        manual('type(indice) is int and indice in (2, 3)', 'True',
               'indice = chercher([1, 5, 6, 6, 9, 12], 6, 0, 5)',
               'Accepter chacun des deux indices où figure 6'),
        manual('chercher([1, 5, 6, 6, 9, 12], 9, 0, 5)', '4'),
        manual('chercher([1], 1, 0, 0)', '0')],
    '27-2': [manual("depouille(['A', 'B', 'A'])", "{'A': 2, 'B': 1}"),
        manual("depouille([])", "{}"),
        manual("sorted(vainqueurs({'A': 2, 'B': 2, 'C': 1}))", "['A', 'B']",
               '', 'Retrouver les deux candidats à égalité')],
    '03-2': [manual("eleves_du_mois(['a', 'b', 'c', 'd'], [15, 18, 12, 18])", "(18, ['b', 'd'])")],
    '04-2': [manual('tab', '[1, 2, 3, 3, 6, 7, 9]', 'tab = [9, 3, 7, 2, 3, 1, 6]\ntri_bulles(tab)', 'Vérifier le contenu du tableau après le tri')],
    '07-1': [manual("nbr_occurrences('Hello world !')", "{'H': 1, 'e': 1, 'l': 3, 'o': 2, ' ': 2, 'w': 1, 'r': 1, 'd': 1, '!': 1}"), manual("nbr_occurrences('')", '{}')],
    '11-1': [manual('parcours_largeur(arbre)', '[4, 2, 6, 1, 3, 5, 7]', 'arbre = (((None, 1, None), 2, (None, 3, None)), 4, ((None, 5, None), 6, (None, 7, None)))')],
    '14-1': [
        manual('type(tirages) is list and len(tirages) == 5 and all(type(x) is int and 1 <= x <= 6 for x in tirages)', 'True', 'tirages = lancer(5)', 'Cinq lancers de dé valides'),
        manual('lancer(0)', '[]'), manual('paire_6([5, 6, 6, 2, 2])', 'True'), manual('paire_6([2, 2, 6])', 'False')],
    '14-2': [manual('nombre_lignes([[20, 34, 254], [23, 124, 237]])', '2'), manual('nombre_colonnes([[20, 34, 254], [23, 124, 237]])', '3'), manual('negatif([[0, 120, 255]])', '[[255, 135, 0]]'), manual('binaire([[0, 200, 255]], 120)', '[[0, 255, 255]]')],
    '16-1': [manual('moyenne([(15.0, 2), (9.0, 1), (12.0, 3)])', '12.5')],
    '17-1': [manual('hauteur(a)', '2', 'a = Noeud(1, Noeud(4, None, None), Noeud(0, None, Noeud(7, None, None)))'), manual('taille(a)', '4', 'a = Noeud(1, Noeud(4, None, None), Noeud(0, None, Noeud(7, None, None)))'), manual('hauteur(None)', '-1'), manual('taille(None)', '0')],
    '20-2': [manual('carte.recuperer_valeur() + " de " + carte.recuperer_couleur()', "'8 de coeur'", 'carte = Paquet_de_cartes().recuperer_carte(20)', 'Vérifier la carte à la position 20'), manual('carte.recuperer_valeur() + " de " + carte.recuperer_couleur()', "'As de pique'", 'carte = Paquet_de_cartes().recuperer_carte(0)', 'Vérifier la carte à la position 0')],
    '22-2': [manual('adresse1.liste_octets()', '[192, 168, 0, 1]'), manual('adresse1.est_reservee()', 'False'), manual('adresse3.est_reservee()', 'True'), manual('adresse2.adresse_suivante().adresse', "'192.168.0.3'")],
    '23-1': [manual('effectif_notes([0, 3, 3, 10])', '[1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 1]'), manual('notes_triees([1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 1])', '[0, 3, 3, 10]')],
    '24-2': [manual('parcours(a, [])', '[1, 5, 8]', 'a = insere(None, 5)\na = insere(a, 1)\na = insere(a, 8)', 'Insérer trois clés puis effectuer un parcours infixe')],
    '25-1': [manual('annee_temperature_minimale(t_moy, annees)', '(12.5, 2016)')],
    '26-2': [manual('nombre_coups()', '11', 'randint = lambda a, b: 1', 'Simuler un dé qui donne toujours 1')],
    '28-2': [manual('genere_grille([(0, 0), (1, 1)])', "[[-1, 2], [2, -1]]")],
    '29-1': [manual("[a['nom'] for a in selection_enclos(animaux, 5)]", "['Titine', 'Mirza']", '', 'Retrouver les animaux de l’enclos 5'), manual('selection_enclos(animaux, 7)', '[]')],
    '29-2': [manual('trouver_intrus([8, 5, 5, 5, 9, 9, 9, 18, 18, 18, 3, 3, 3], 0, 12)', '8'), manual('trouver_intrus([5, 5, 5, 1, 1, 1, 0, 0, 0, 2], 0, 9)', '2')],
    '30-2': [manual("Expr(Expr(None, 1, None), '+', Expr(None, 2, None)).infixe()", "'(1+2)'"), manual('Expr(None, 7, None).infixe()', "'7'")],
    '33-1': [manual('insertion_abr(abr1, 2)', 'abr1'), manual('insertion_abr(abr1, 4)', '((None, 0, None), 1, (None, 2, (None, 3, (None, 4, None))))')],
    '34-1': [manual('tab', '[-9, 1, 6, 12, 52]', 'tab = [1, 52, 6, -9, 12]\ntri_selection(tab)', 'Vérifier le contenu du tableau après le tri')],
    '34-2': [manual("'Bravo' in sortie.getvalue() and '42' in sortie.getvalue()", 'True', 'import io, contextlib\nrandint = lambda a, b: 42\ninput = lambda invite: "42"\nsortie = io.StringIO()\nwith contextlib.redirect_stdout(sortie):\n    plus_ou_moins()', 'Trouver 42 au premier essai')],
    '36-2': [manual('(arbre.gauche.etiquette, arbre.droit.etiquette, arbre.gauche.gauche.etiquette, arbre.gauche.droit.etiquette)', '(3, 9, 1, 6)', 'arbre = Noeud(7)\nfor cle in (3, 9, 1, 6):\n    arbre.inserer(cle)', 'Insérer quatre clés et vérifier la structure')],
    '37-1': [manual('gb_vers_entier([True, False, True])', '5')],
    '37-2': [manual('tab', '[9, 12, 23, 98, 104, 131]', 'tab = [98, 12, 104, 23, 131, 9]\ntri_insertion(tab)', 'Vérifier le contenu du tableau après le tri')],
    '39-2': [manual('tab', '[0, 0, 0, 0, 0, 1, 1, 1, 1]', 'tab = [0, 1, 0, 1, 0, 1, 0, 1, 0]\ntri(tab)', 'Vérifier le contenu du tableau après le tri')],
    '40-2': [manual('moyenne("Dupont", resultats)', '14.5'), manual('moyenne("Durand", resultats)', '8.5')],
    '41-2': [manual('Carre([3, 4, 5, 4, 4, 4, 5, 4, 3], 3).est_semimagique()', 'True'), manual('Carre([1, 2, 3, 4], 2).est_semimagique()', 'False')],
    '43-2': [manual('M', '[[0, 0, 1, 0], [0, 3, 0, 1], [3, 3, 3, 0], [0, 3, 3, 0]]', 'M = [[0, 0, 1, 0], [0, 1, 0, 1], [1, 1, 1, 0], [0, 1, 1, 0]]\ncolore_comp1(M, 2, 1, 3)', 'Contrôler la coloration de la composante')],
    '44-2': [manual('dessin_zoom([[1, 0]], 2)', '[[1, 1, 0, 0], [1, 1, 0, 0]]')],
    '47-1': [manual("taille(a, 'F')", '9'), manual("taille(a, 'I')", '2')],
    '47-2': [manual('tab', '[6, 12, 16, 18, 21, 41, 55]', 'tab = [41, 55, 21, 18, 12, 6, 25]\ntri_selection(tab)', 'Vérifier le contenu du tableau après le tri')],
}

GIVEN = {
    '17': '''class Noeud:
    def __init__(self, etiquette, gauche, droit):
        self.v = etiquette
        self.gauche = gauche
        self.droit = droit
''',
    '25': '''t_moy = [14.9, 13.3, 13.1, 12.5, 13.0, 13.6, 13.7]
annees = [2013, 2014, 2015, 2016, 2017, 2018, 2019]
''',
    '29': '''animaux = [
    {'nom': 'Medor', 'espece': 'chien', 'age': 5, 'enclos': 2},
    {'nom': 'Titine', 'espece': 'chat', 'age': 2, 'enclos': 5},
    {'nom': 'Tom', 'espece': 'chat', 'age': 7, 'enclos': 4},
    {'nom': 'Belle', 'espece': 'chien', 'age': 6, 'enclos': 3},
    {'nom': 'Mirza', 'espece': 'chat', 'age': 6, 'enclos': 5},
]
''',
    '33': '''n0 = (None, 0, None)
n3 = (None, 3, None)
n2 = (None, 2, n3)
abr1 = (n0, 1, n2)
''',
    '47': '''a = {'F': ['B', 'G'], 'B': ['A', 'D'], 'A': ['', ''],
     'D': ['C', 'E'], 'C': ['', ''], 'E': ['', ''],
     'G': ['', 'I'], 'I': ['', 'H'], 'H': ['', '']}
''',
}

def starter2(n, source):
    if n == '22':
        return source.rstrip() + "\n\n# Instancier ici adresse1, adresse2 et adresse3.\n"
    return source

def run(archive):
    subjects = []
    with ZipFile(archive) as outer:
        for i, (theme, title1, title2) in enumerate(TITLES, 1):
            n = f'{i:02}'
            folder = DIST / 'sujets' / n
            folder.mkdir(parents=True, exist_ok=True)
            with ZipFile(io.BytesIO(outer.read(f'25-NSI-{n}.zip'))) as inner:
                paths = {}
                for name in inner.namelist():
                    base = Path(name).name
                    suffix = Path(base).suffix
                    if suffix in {'.pdf', '.py'}:
                        paths[suffix] = folder / base
                        paths[suffix].write_bytes(inner.read(name))
            pdf = paths['.pdf']
            pages = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-']).decode().split('\f')[:-1]
            split = next(j for j, p in enumerate(pages) if PAGES.search(p))
            if '--rendu' in sys.argv:
                with tempfile.TemporaryDirectory() as tmp:
                    subprocess.run(['pdftoppm', '-f', '2', '-r', '132', '-png', str(pdf), f'{tmp}/page'], check=True)
                    for f in Path(tmp).glob('page-*.png'):
                        page = int(f.stem.split('-')[-1])
                        with Image.open(f) as im:
                            margin_x = round(im.width * .06)
                            margin_y = round(im.height * .045)
                            visible = im.crop((margin_x, margin_y, im.width - margin_x, im.height))
                            visible.convert('RGB').save(folder / f'{page}.webp', 'WEBP', quality=91, method=4)
            exs = []
            for j, (lo, hi, title) in enumerate([(1, split, title1), (split, len(pages), title2)], 1):
                key = f'{n}-{j}'
                tests = EXTRA.get(key, [])
                if key not in {'01-1', '14-1', '15-2', '17-1', '27-2', '33-1'}:
                    tests = tests + examples(pages[lo:hi])
                if not tests:
                    raise ValueError(f'{key} sans vérification')
                for test in tests:
                    compile(test['expr'], key, 'eval')
                    compile(test['expected'], key, 'eval')
                    compile(test.get('setup', ''), key, 'exec')
                source = (GIVEN.get(n, '').rstrip() + '\n\n' if n in GIVEN else '') + '# Écrivez votre solution ici.\n' if j == 1 else starter2(n, local_code(paths['.py']))
                exs.append({'title': title, 'starter': source, 'tests': tests, 'pages': [
                    {'number': p + 1, 'text': re.sub(r'\n\s*\d+/\d+\s*$', '', pages[p]).strip('\n').rstrip()}
                    for p in range(lo, hi)
                ]})
            subject = {'id': n, 'theme': theme, 'titles': [title1, title2], 'pdf': pdf.name, 'python': paths['.py'].name}
            subjects.append(subject)
            (folder / 'atelier.json').write_text(json.dumps({'exercises': exs}, ensure_ascii=False))
    (DIST / 'catalogue.json').write_text(json.dumps(subjects, ensure_ascii=False))

if __name__ == '__main__':
    run(Path(sys.argv[1]))
