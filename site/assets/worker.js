/* global loadPyodide */
const base = new URL('./python/', self.location.href);
importScripts(new URL('pyodide.js', base).href);

let python;
const harness = `
def _atelier_run(code, cases, reset_input):
    import ast
    import json
    import traceback
    space = {"__name__": "__main__"}
    try:
        tree = ast.parse(code, filename="solution.py")
        if not cases and tree.body and isinstance(tree.body[-1], ast.Expr):
            last = tree.body.pop()
            exec(compile(tree, "solution.py", "exec"), space)
            result = eval(compile(ast.Expression(last.value), "solution.py", "eval"), space)
            if result is not None:
                print(repr(result))
        else:
            compiled = compile(tree, "solution.py", "exec")
            if not cases:
                exec(compiled, space)
    except (Exception, SystemExit) as error:
        if isinstance(error, SyntaxError):
            details = "".join(traceback.format_exception_only(type(error), error))
        else:
            frames = traceback.extract_tb(error.__traceback__)[1:]
            details = "".join(traceback.format_list(frames) + traceback.format_exception_only(type(error), error))
        return json.dumps({"error": details[:6000]})
    results = []
    for case in cases:
        # Exécuter le code dans un nouvel espace pour chaque cas.
        context = {"__name__": "__main__"}
        try:
            reset_input()
            exec(compiled, context)
            exec(case.get("setup", ""), context)
            actual = eval(case["expr"], context)
            expected = eval(case["expected"], context)
            same = actual == expected and (type(actual) is bool) == (type(expected) is bool)
            results.append({"pass": bool(same), "actual": repr(actual)[:320], "expected": repr(expected)[:320]})
        except (Exception, SystemExit) as error:
            results.append({"pass": False, "error": f"{type(error).__name__}: {error}"[:320]})
    return json.dumps({"results": results})
`;

async function initialize() {
  python = await loadPyodide({indexURL: base.href});
  python.runPython(harness);
  self.postMessage({type: 'ready'});
}

self.onmessage = ({data}) => {
  if (data.type === 'init') {
    initialize().catch(error => self.postMessage({type: 'init-error', error: String(error)}));
    return;
  }
  if (data.type !== 'run' || !python) return;
  let output = '';
  const maxOutput = 12000;
  let truncated = false;
  function append(line) {
    const remaining = maxOutput - output.length;
    if (line.length + 1 > remaining) truncated = true;
    if (remaining > 0) output += (line + '\n').slice(0, remaining);
  }
  const lines = data.stdin.length ? data.stdin.split(/\r?\n/) : [];
  let lineIndex = 0;
  python.setStdin({stdin: () => lines[lineIndex++] ?? null});
  python.setStdout({batched: append});
  python.setStderr({batched: append});
  python.globals.set('_atelier_code', data.code);
  python.globals.set('_atelier_cases_json', JSON.stringify(data.cases));
  python.globals.set('_atelier_reset_input', () => {lineIndex = 0;});
  try {
    const result = JSON.parse(python.runPython(
      '_atelier_run(_atelier_code, __import__("json").loads(_atelier_cases_json), _atelier_reset_input)'
    ));
    self.postMessage({type: 'result', ...result, output: output + (truncated ? '\n[Sortie tronquée]\n' : '')});
  } catch (error) {
    self.postMessage({type: 'result', error: String(error), output});
  } finally {
    python.globals.delete('_atelier_code');
    python.globals.delete('_atelier_cases_json');
    python.globals.delete('_atelier_reset_input');
  }
};
