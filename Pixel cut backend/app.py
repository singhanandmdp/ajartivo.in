import os

os.environ.setdefault("NUMBA_DISABLE_JIT", "1")

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from rembg import remove, new_session
from PIL import Image
import io
from functools import lru_cache
from pathlib import Path
from ultralytics import YOLO

app = Flask(__name__)
CORS(app)

u2net_session = new_session("u2net")
BASE_DIR = Path(__file__).resolve().parent
YOLO_MODEL_PATH = BASE_DIR / "yolov8n.pt"

@lru_cache(maxsize=1)
def get_yolo_model():
    return YOLO(str(YOLO_MODEL_PATH))

@app.route('/')
def home():
    return "AJ Pixel Cut API Running 🚀"

@app.route('/remove-bg', methods=['POST'])
def remove_bg():
    try:
        file = request.files['image']
        input_image = Image.open(file.stream).convert("RGBA")

        output = remove(input_image)

        img_io = io.BytesIO()
        output.save(img_io, format="PNG")
        img_io.seek(0)

        return send_file(img_io, mimetype='image/png')

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def crop_to_primary_object(input_image):
    results = get_yolo_model()(input_image)
    boxes = results[0].boxes.xyxy.cpu().numpy()

    if len(boxes) == 0:
        return input_image, (0, 0, input_image.width, input_image.height)

    best_box = max(boxes, key=lambda box: max(0, box[2] - box[0]) * max(0, box[3] - box[1]))
    x1, y1, x2, y2 = best_box

    padding = 30
    x1 = max(0, int(x1 - padding))
    y1 = max(0, int(y1 - padding))
    x2 = min(input_image.width, int(x2 + padding))
    y2 = min(input_image.height, int(y2 + padding))

    return input_image.crop((x1, y1, x2, y2)), (x1, y1, x2, y2)

@app.route('/smart-remove-bg', methods=['POST'])
def smart_remove_bg():
    try:
        file = request.files['image']
        input_image = Image.open(file.stream).convert("RGB")
        cropped, crop_box = crop_to_primary_object(input_image)
        output = remove(cropped.convert("RGBA"), session=u2net_session)

        full_output = Image.new("RGBA", input_image.size, (0, 0, 0, 0))
        full_output.paste(output, (crop_box[0], crop_box[1]), output)

        img_io = io.BytesIO()
        full_output.save(img_io, format="PNG")
        img_io.seek(0)

        return send_file(img_io, mimetype='image/png')

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/smart-crop', methods=['POST'])
def smart_crop():
    try:
        file = request.files['image']
        input_image = Image.open(file.stream).convert("RGB")
        cropped, _ = crop_to_primary_object(input_image)

        img_io = io.BytesIO()
        cropped.save(img_io, format="PNG")
        img_io.seek(0)

        return send_file(img_io, mimetype='image/png')

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
