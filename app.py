from flask import Flask, jsonify, render_template, request
from calculator import calculate_summary, load_catalog

app = Flask(__name__)
CATALOG = load_catalog()


@app.route("/")
def index():
    return render_template("index.html", catalog=CATALOG)


@app.get("/api/catalog")
def api_catalog():
    return jsonify(CATALOG)


@app.post("/api/calculate")
def api_calculate():
    payload = request.get_json(silent=True) or {}
    return jsonify(calculate_summary(CATALOG, payload))


if __name__ == "__main__":
    app.run(debug=True)
