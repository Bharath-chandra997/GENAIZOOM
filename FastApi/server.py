import os
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# --- CONFIGURATION ---
# The UPLOAD_FOLDER is no longer needed for the primary logic but can be kept if you have other uses for it.
UPLOAD_FOLDER = "./uploads"
REMOTE_API_ENDPOINT = "https://ruthwik-pathvqa-yesno-api.hf.space/predict"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- FASTAPI APP SETUP ---
app = FastAPI(title="SynergySphere Proxy API")

# Enable CORS to allow your frontend to communicate with this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins, you can restrict this to your frontend's URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PREDICTION ROUTE (REVISED & CORRECTED) ---
@app.post("/predict")
async def predict(image: UploadFile = File(...), audio: UploadFile = File(...)):
    """
    Receives image and audio files, reads them into memory,
    and forwards them to the remote ML model API.
    """
    try:
        # 1. Read file contents directly into memory (as bytes)
        image_content = await image.read()
        audio_content = await audio.read()

        # 2. Prepare files for the forwarding request using the in-memory content
        files = {
            "image": (image.filename, image_content, image.content_type),
            "audio": (audio.filename, audio_content, audio.content_type),
        }

        # 3. Forward the request to the Hugging Face Space using an async HTTP client
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(REMOTE_API_ENDPOINT, files=files)

        # Handle non-successful responses from the remote API
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail={
                    "error": "Remote API call failed",
                    "status_code": response.status_code,
                    "details": response.text,
                },
            )

        return JSONResponse(content=response.json())

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Remote API request timed out")

    except Exception as e:
        # This will print the actual error to your Python terminal for easier debugging
        print(f"An unexpected error occurred: {e}")
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {str(e)}")

# --- HEALTH CHECK ROUTE ---
@app.get("/")
async def health_check():
    """
    A simple endpoint to verify that the proxy server is running.
    """
    return {"status": "✅ Proxy server is running and connected to Hugging Face Space."}


# --- RUNNING THE APP ---
# To run this server, use the following command in your terminal:
# uvicorn model_server:app --host 0.0.0.0 --port 5001 --reload