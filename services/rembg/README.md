# rembg service

A small CPU container that removes backgrounds. The Next.js app calls it at `REMBG_URL`.

**Local:**
```bash
cd services/rembg
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
PORT=5001 python server.py      # then REMBG_URL=http://localhost:5001 in the app
```

**Docker:** `docker build -t rembg-service . && docker run -p 8080:8080 -e REMBG_TOKEN=secret rembg-service`

**Fly.io:** see `fly.toml` (scales to zero). On Railway, deploy the Dockerfile and set `PORT`.

Models: `isnet-general-use` (default: sharpest edges, removes gaps such as between laces), `u2net` (general purpose), `u2netp` (small, fast). `REMBG_MODEL` sets the default and is baked into the Docker image; `REMBG_MODELS` lists the models a request may pick with `?model=`. Optional per request: `post_process=1` (smooth the mask edge, recommended) and `alpha_matting=1` (refines soft edges, but produced blocky artifacts on the demo samples).

Check it: `curl -s localhost:5001/health`

**On Fly.io the service refuses to start without `REMBG_TOKEN`**, so a public deployment can't be used by strangers: `fly secrets set REMBG_TOKEN=$(openssl rand -hex 24)`, and set the same value as `REMBG_TOKEN` in the app.
