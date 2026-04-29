FROM python:3.11-slim

# Install system dependencies required by XTTS v2 / audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy pinned requirements first for better layer caching
COPY requirements.txt /tmp/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Set working directory
WORKDIR /opt/ml/code

# Copy inference code
COPY handler.py /opt/ml/code/handler.py
COPY serve.py /opt/ml/code/serve.py

# Expose SageMaker inference port
EXPOSE 8080

# Single worker: XTTS v2 model is large; multiple workers would OOM on ml.g4dn.xlarge
ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:8080", "--timeout", "120", "--workers", "1", "serve:app"]
