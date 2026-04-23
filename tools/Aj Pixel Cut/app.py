import io
import os
from typing import Optional, Set, Tuple

from flask import Flask, Response, jsonify, make_response, request, send_file, send_from_directory
from PIL import Image, UnidentifiedImageError
from rembg import remove


DEFAULT_ALLOWED_ORIGINS: Tuple[str, ...] = (
    "https://ajartivo.in",
    "https://www.ajartivo.in",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
)

DEFAULT_MAX_UPLOAD_MB = 12
ALLOWED_MIME_TYPES: Tuple[str, ...] = ("image/png", "image/jpeg", "image/webp")


def _parse_allowed_origins(value: Optional[str]) -> Set[str]:
    if not value:
        return set(DEFAULT_ALLOWED_ORIGINS)

    raw = [item.strip() for item in value.split(",")]
    origins: Set[str] = {item for item in raw if item}
    return origins or set(DEFAULT_ALLOWED_ORIGINS)


def _apply_cors(response: Response, allowed_origins: Set[str]) -> Response:
    origin = (request.headers.get("Origin") or "").strip()
    if not origin:
        return response

    if "*" in allowed_origins or origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS, GET"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"

    return response


def _json_error(message: str, status_code: int) -> Response:
    response = jsonify({"ok": False, "error": message})
    response.status_code = status_code
    return response


def create_app() -> Flask:
    app = Flask(__name__)
    base_dir = os.path.dirname(os.path.abspath(__file__))

    max_upload_mb = int(os.getenv("AJ_PIXELCUT_MAX_UPLOAD_MB", str(DEFAULT_MAX_UPLOAD_MB)))
    app.config["MAX_CONTENT_LENGTH"] = max_upload_mb * 1024 * 1024

    allowed_origins = _parse_allowed_origins(os.getenv("AJ_PIXELCUT_ALLOWED_ORIGINS"))

    @app.after_request
    def _after_request(response: Response) -> Response:
        response.headers["Cache-Control"] = "no-store"
        return _apply_cors(response, allowed_origins)

    @app.errorhandler(413)
    def _too_large(_error: Exception) -> Response:
        return _json_error(f"File too large. Max {max_upload_mb} MB allowed.", 413)

    @app.get("/health")
    def health() -> Response:
        return jsonify({"ok": True, "service": "aj-pixel-cut"})

    @app.get("/")
    def home() -> Response:
        return send_from_directory(base_dir, "index.html")

    @app.get("/style.css")
    def style() -> Response:
        return send_from_directory(base_dir, "style.css")

    @app.get("/icon/<path:filename>")
    def icon(filename: str) -> Response:
        return send_from_directory(os.path.join(base_dir, "icon"), filename)

    @app.route("/remove-bg", methods=["POST", "OPTIONS"])
    def remove_bg() -> Response:
        if request.method == "OPTIONS":
            return make_response("", 204)

        if "image" not in request.files:
            return _json_error("Missing form file field: image", 400)

        file = request.files["image"]
        mime_type = (file.mimetype or file.content_type or "").split(";")[0].strip().lower()
        if mime_type and mime_type not in ALLOWED_MIME_TYPES:
            return _json_error(f"Unsupported image type. Allowed: {', '.join(ALLOWED_MIME_TYPES)}", 415)

        try:
            raw_bytes = file.read()
            if not raw_bytes:
                return _json_error("Empty file uploaded.", 400)

            input_image = Image.open(io.BytesIO(raw_bytes))
            input_image.load()
        except UnidentifiedImageError:
            return _json_error("Invalid image file.", 400)
        except Exception:
            return _json_error("Unable to read image.", 400)

        try:
            output_image = remove(input_image)
        except Exception:
            return _json_error("Background removal failed.", 500)

        img_io = io.BytesIO()
        try:
            output_image.save(img_io, format="PNG")
        except Exception:
            return _json_error("Failed to encode output image.", 500)

        img_io.seek(0)
        return send_file(
            img_io,
            mimetype="image/png",
            as_attachment=False,
            download_name="output.png",
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
