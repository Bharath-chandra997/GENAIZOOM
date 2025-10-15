# import os
# import httpx
# from fastapi import FastAPI, UploadFile, File, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import JSONResponse

# # --- CONFIGURATION ---
# REMOTE_API_ENDPOINT = "https://ruthwik-pathvqa-yesno-api.hf.space/predict"
# UPLOAD_FOLDER = "./uploads"
# os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Kept for potential future use, though not needed for /predict

# # --- FASTAPI APP SETUP ---
# app = FastAPI(title="SynergySphere Proxy API")

# # Enable CORS to allow frontend communication
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["https://genaizoom123.onrender.com"],  # Restrict to your frontend in production
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # --- PREDICTION ROUTE ---
# @app.post("/predict")
# async def predict(image: UploadFile = File(...), audio: UploadFile = File(None)):
#     """
#     Receives image and optional audio files, reads them into memory,
#     and forwards them to the remote ML model API.
#     """
#     try:
#         # Read file contents into memory
#         image_content = await image.read()
#         audio_content = await audio.read() if audio else None

#         # Prepare files for the forwarding request
#         files = {
#             "image": (image.filename, image_content, image.content_type),
#         }
#         if audio_content:
#             files["audio"] = (audio.filename, audio_content, audio.content_type)

#         # Forward to Hugging Face API
#         async with httpx.AsyncClient(timeout=30.0) as client:  # Reduced timeout for faster failure
#             response = await client.post(REMOTE_API_ENDPOINT, files=files)

#         if response.status_code != 200:
#             raise HTTPException(
#                 status_code=response.status_code,
#                 detail={
#                     "error": "Remote API call failed",
#                     "status_code": response.status_code,
#                     "details": response.text,
#                 },
#             )

#         return JSONResponse(content=response.json())

#     except httpx.TimeoutException:
#         raise HTTPException(status_code=504, detail="Remote API request timed out")
#     except Exception as e:
#         print(f"An unexpected error occurred: {e}")
#         raise HTTPException(status_code=500, detail=f"An internal error occurred: {str(e)}")

# # --- HEALTH CHECK ROUTE ---
# @app.get("/")
# async def health_check():
#     """
#     Verify that the proxy server is running.
#     """
#     return {"status": "✅ Proxy server is running and connected to Hugging Face Space."}

# # --- RUNNING THE APP ---
# if __name__ == "__main__":
#     import uvicorn
#     port = int(os.getenv("PORT", 8000))  # Use Render's PORT or default to 8000 for local
#     print(f"Starting FastAPI server on port {port}")
#     uvicorn.run(app, host="0.0.0.0", port=port)




import os
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from gradio_client import Client, file

# --- CONFIGURATION ---
# Define the Gradio client connection
print("Connecting to Hugging Face Space...")
try:
    # This is the name of the Space you want to connect to
    client = Client("Ruthwik/tmpathvqa-model-demo")
    print("✅ Connection successful!")
except Exception as e:
    print(f"❌ Failed to connect to Hugging Face Space: {e}")
    client = None

UPLOAD_FOLDER = "./uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- FASTAPI APP SETUP ---
app = FastAPI(title="SynergySphere Proxy API")

# Enable CORS to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    # Be sure to restrict this to your actual frontend's domain in a production environment
    allow_origins=["https://genaizoom123.onrender.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API ROUTES ---

@app.post("/predict")
async def predict(
    image: UploadFile = File(...),
    audio: UploadFile = File(...)
):
    """
    Proxy endpoint for the VQA model.
    Receives mandatory image and audio files, saves them temporarily, 
    sends them to a Gradio backend, and returns the prediction.
    """
    if not client:
        raise HTTPException(status_code=503, detail="Gradio client not connected to Hugging Face Space.")

    # Generate unique paths for temporary files
    image_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}_{image.filename}")
    audio_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}_{audio.filename}")

    try:
        # Save the uploaded image to the temporary path
        with open(image_path, "wb") as f:
            content = await image.read()
            f.write(content)
            
        # Save the uploaded audio to its temporary path
        with open(audio_path, "wb") as f:
            content = await audio.read()
            f.write(content)

        # The function `file()` prepares the local files for the API call,
        # similar to `handle_file()` in your example.
        result = client.predict(
            image=file(image_path),
            audio=file(audio_path),
            api_name="/predict"
        )

        # The result from the model is the final prediction
        return JSONResponse(content={"prediction": result})

    except Exception as e:
        print(f"An error occurred during prediction: {e}")
        raise HTTPException(
            status_code=500, detail=f"An internal error occurred: {str(e)}"
        )
    finally:
        # --- CRITICAL: Clean up temporary files ---
        if os.path.exists(image_path):
            os.remove(image_path)
        if os.path.exists(audio_path):
            os.remove(audio_path)


@app.get("/")
async def health_check():
    """
    Health check to verify that the proxy server is running.
    """
    status = "✅ Proxy server is running and connected to Hugging Face Space." if client else "❌ Proxy server is running but FAILED to connect to Hugging Face Space."
    return {"status": status}


# --- RUNNING THE APP ---
if __name__ == "__main__":
    import uvicorn

    # Use the PORT environment variable provided by Render, default to 8000 for local dev
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting FastAPI server on host 0.0.0.0, port {port}")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)

