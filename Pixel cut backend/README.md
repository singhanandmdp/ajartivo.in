# AJ Pixel Cut (Background Remover)

This folder contains a small Flask API + demo UI for removing image backgrounds using `rembg`.

## Run locally

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Then open `http://localhost:5000/`.

## Website integration (AJartivo)

For a static website, host this Flask app as an API service and call:

- `POST /remove-bg` with `multipart/form-data` field name `image`
- `POST /smart-remove-bg` with `multipart/form-data` field name `image`
- `POST /smart-crop` with `multipart/form-data` field name `image`

Optional env vars:

- `AJ_PIXELCUT_ALLOWED_ORIGINS` (comma-separated, supports `*`)
- `AJ_PIXELCUT_MAX_UPLOAD_MB` (default: `12`)
